import { userRepository } from '../repositories/user.repository.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { categoryRepository } from '../repositories/category.repository.js';
import { serviceRepository } from '../repositories/service.repository.js';
import { SystemSettings } from '../models/systemSettings.model.js';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

export class CustomerDashboardService {

  // 1. MOBILE HOME FEED
  async getDashboardOverview(customer) {
    const user = await userRepository.findById(customer._id);
    const recentBookings = await bookingRepository.find({ customer: customer._id }, '', { createdAt: -1 });

    // Auto-cleanup legacy 12450 default from old schema if user has no transactions
    let userWalletBal = user?.walletBalance || 0;
    if (userWalletBal === 12450 || user?.availableBalance === 12450) {
      const { WalletTransaction } = await import('../models/walletTransaction.model.js');
      const txCount = await WalletTransaction.countDocuments({ user: customer._id });
      if (txCount === 0) {
        user.walletBalance = 0;
        user.availableBalance = 0;
        user.withdrawableBalance = 0;
        await user.save();
        userWalletBal = 0;
      }
    }

    return {
      banners: [
        { id: 1, title: 'AC Jet Deep Cleaning', discount: 'Flat 50% OFF', code: 'SUMMER50', bg: 'linear-gradient(135deg, #2563eb, #7c3aed)' },
        { id: 2, title: 'Full House Deep Clean', discount: 'Save ₹500 Instant', code: 'CLEAN500', bg: 'linear-gradient(135deg, #059669, #10b981)' },
      ],
      categories: await this.getCategories(),
      popularServices: await this.getPopularServices(),
      featuredServices: await this.getFeaturedServices(),
      offers: await this.getOffers(customer),
      walletBalance: userWalletBal,
      favoriteServices: user?.favoriteServices || [],
      savedAddresses: user?.addresses || [],
      recentBookings: recentBookings.slice(0, 3),
    };
  }

  // 2. CATEGORIES & SERVICES (Real Database Data Created By Admin)
  async getCategories() {
    return await categoryRepository.findActiveCategories();
  }

  async getPopularServices() {
    return await serviceRepository.findActiveServices();
  }

  async getFeaturedServices() {
    return await serviceRepository.findActiveServices();
  }

  async getOffers(customer) {
    const { Coupon } = await import('../models/coupon.model.js');
    let coupons = await Coupon.find({ isActive: true }).sort({ createdAt: -1 });

    // Seed defaults if empty
    if (coupons.length === 0) {
      await Coupon.insertMany([
        {
          code: 'FIRST30',
          title: '30% Off on your first booking',
          description: 'Valid on bookings above ₹1,000',
          discountType: 'percentage',
          discountValue: 30,
          maxDiscountAmount: 300,
          minBookingAmount: 1000,
          usageLimitPerUser: 1,
          isActive: true,
        },
        {
          code: 'HOME50',
          title: 'Flat ₹50 Off on Deep Cleaning',
          description: 'Can be applied once per user',
          discountType: 'fixed',
          discountValue: 50,
          minBookingAmount: 300,
          usageLimitPerUser: 1,
          isActive: true,
        },
        {
          code: 'WEEKEND80',
          title: 'Up to ₹80 Off on weekends',
          description: 'Valid on Saturday & Sunday only',
          discountType: 'fixed',
          discountValue: 80,
          minBookingAmount: 500,
          usageLimitPerUser: 1,
          isActive: true,
        },
      ]);
      coupons = await Coupon.find({ isActive: true }).sort({ createdAt: -1 });
    }

    // Filter out coupons already used by this customer (if customer logged in)
    if (customer && customer._id) {
      const cIdStr = String(customer._id);
      coupons = coupons.filter((c) => {
        const userUsageCount = (c.usedBy || []).filter((u) => String(u.customerId) === cIdStr).length;
        return userUsageCount < (c.usageLimitPerUser || 1);
      });
    }

    return coupons;
  }

  async applyCoupon(customer, data) {
    const { Coupon } = await import('../models/coupon.model.js');
    const { code, bookingAmount } = data;

    if (!code) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Please enter a valid coupon code.');
    }

    const cleanCode = String(code).trim().toUpperCase();
    const coupon = await Coupon.findOne({ code: cleanCode, isActive: true });

    if (!coupon) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, `Coupon code '${cleanCode}' is invalid or expired.`);
    }

    // Check Date Expiry
    if (coupon.validUntil && new Date() > new Date(coupon.validUntil)) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, `Coupon code '${cleanCode}' has expired.`);
    }

    // Check Single-Use / Usage Limit Per User
    const cIdStr = String(customer._id);
    const userUsageCount = (coupon.usedBy || []).filter((u) => String(u.customerId) === cIdStr).length;
    const limit = coupon.usageLimitPerUser || 1;

    if (userUsageCount >= limit) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        `You have already used the coupon code '${cleanCode}'. This coupon can only be used ${limit} time(s) per user.`
      );
    }

    // Check Minimum Booking Amount Condition
    const amount = Number(bookingAmount || 0);
    if (amount < (coupon.minBookingAmount || 0)) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        `Coupon '${cleanCode}' is valid only on bookings above ₹${coupon.minBookingAmount}. Your current total is ₹${amount}.`
      );
    }

    // Calculate Discount
    let discountAmount = 0;
    if (coupon.discountType === 'percentage') {
      const calculated = Math.round((amount * coupon.discountValue) / 100);
      discountAmount = coupon.maxDiscountAmount
        ? Math.min(calculated, coupon.maxDiscountAmount)
        : calculated;
    } else {
      discountAmount = Math.min(coupon.discountValue, amount);
    }

    const finalAmount = Math.max(0, amount - discountAmount);

    return {
      message: `🎉 Coupon '${cleanCode}' applied! Saved ₹${discountAmount}`,
      applied: true,
      coupon: {
        id: coupon._id,
        code: coupon.code,
        title: coupon.title,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount,
        finalAmount,
      },
    };
  }

  // 3. WALLET, NOTIFICATIONS & REVIEWS
  async getWallet(customer) {
    const user = await userRepository.findById(customer._id);
    const { WalletTransaction } = await import('../models/walletTransaction.model.js');

    // Auto-cleanup legacy 12450 default balance for old accounts without transactions
    if (user && (user.walletBalance === 12450 || user.availableBalance === 12450)) {
      user.walletBalance = 0;
      user.availableBalance = 0;
      user.withdrawableBalance = 0;
      await user.save();
    }

    // Fetch ONLY real customer wallet transactions
    const rawTxns = await WalletTransaction.find({ user: customer._id }).sort({ createdAt: -1 });

    const currentBal = user?.walletBalance ?? 0;

    const formattedTransactions = rawTxns.map((tx) => {
      const txObj = tx.toObject ? tx.toObject() : tx;
      const txDate = txObj.createdAt ? new Date(txObj.createdAt) : new Date();
      
      const now = new Date();
      const isToday = txDate.toDateString() === now.toDateString();
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const isYesterday = txDate.toDateString() === yesterday.toDateString();

      let dateGroup = txDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
      if (isToday) dateGroup = 'TODAY';
      else if (isYesterday) dateGroup = 'YESTERDAY';

      const timeStr = txDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

      return {
        id: txObj._id || txObj.transactionId,
        transactionId: txObj.transactionId || `TXN-${txObj._id}`,
        title: txObj.title || (txObj.type === 'Credit' ? 'Added to Wallet' : 'Service Booking'),
        category: txObj.category || 'Wallet Activity',
        type: txObj.type || 'Credit',
        amount: Number(txObj.amount || 0),
        status: txObj.status || 'Completed',
        paymentMethod: txObj.paymentMethod || 'UPI / Online',
        time: timeStr,
        dateGroup,
        formattedDate: `${dateGroup === 'TODAY' ? 'Today' : dateGroup === 'YESTERDAY' ? 'Yesterday' : dateGroup}, ${timeStr}`,
        createdAt: txObj.createdAt || new Date(),
      };
    });

    return {
      customerId: customer._id,
      balance: currentBal,
      currency: 'INR',
      transactions: formattedTransactions,
    };
  }

  async addWalletMoney(customer, data) {
    const { amount, paymentMethod } = data;
    const rechargeAmount = Number(amount);

    if (!rechargeAmount || isNaN(rechargeAmount) || rechargeAmount <= 0) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Please enter a valid positive amount to add.');
    }

    if (rechargeAmount < 10) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Minimum amount to add is ₹10.');
    }

    if (rechargeAmount > 50000) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Maximum limit per transaction is ₹50,000.');
    }

    const user = await userRepository.findById(customer._id);
    if (!user) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Customer user account not found.');
    }

    const previousBal = user.walletBalance || 0;
    const newBal = previousBal + rechargeAmount;

    user.walletBalance = newBal;
    user.availableBalance = (user.availableBalance || 0) + rechargeAmount;
    await user.save();

    const txnId = `TXN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const chosenMethod = paymentMethod || 'UPI / Google Pay / PhonePe';

    // 1. Create WalletTransaction log
    const { WalletTransaction } = await import('../models/walletTransaction.model.js');
    const transaction = await WalletTransaction.create({
      transactionId: txnId,
      user: customer._id,
      type: 'Credit',
      category: 'Added to Wallet',
      title: `Added from ${chosenMethod.split('/')[0].trim()}`,
      amount: rechargeAmount,
      status: 'Completed',
      paymentMethod: chosenMethod,
    });

    // 2. Create LedgerEntry log
    const { LedgerEntry } = await import('../models/ledgerEntry.model.js');
    await LedgerEntry.create({
      transactionId: txnId,
      userId: customer._id,
      accountType: 'CUSTOMER_WALLET',
      type: 'CUSTOMER_WALLET_CREDIT',
      direction: 'CREDIT',
      amount: rechargeAmount,
      currency: 'INR',
      balanceBefore: previousBal,
      balanceAfter: newBal,
      referenceType: 'DirectRecharge',
      referenceId: txnId,
      status: 'Success',
      idempotencyKey: `topup_${customer._id}_${Date.now()}`,
      metadata: { paymentMethod: chosenMethod },
    }).catch((err) => console.warn('Ledger logging warning:', err));

    return {
      message: `🎉 ₹${rechargeAmount} added to your NOROZZ Wallet successfully!`,
      walletBalance: newBal,
      transaction,
    };
  }

  async getNotifications() {
    return [
      { id: 'NOTIF-1', title: 'Technician Assigned', message: 'Rajesh Kumar has been assigned for your AC Foam Jet Deep Cleaning.', time: '10 mins ago' },
      { id: 'NOTIF-2', title: 'Exclusive Deal', message: 'Use code SUMMERAC for ₹200 OFF on AC servicing today!', time: '3 hours ago' },
    ];
  }

  async getReviews(customer) {
    return [
      { id: 'REV-101', service: 'Full Home Deep Cleaning 3BHK', rating: 5, comment: 'CleanPro team did a fantastic job cleaning my balcony and kitchen!', date: '12 June 2026' },
    ];
  }

  // 4. FAVORITE SERVICES TOGGLE
  async getFavorites(customer) {
    const user = await userRepository.findById(customer._id);
    return user.favoriteServices || [];
  }

  async toggleFavorite(customer, serviceName) {
    const user = await userRepository.findById(customer._id);
    if (!user) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Customer not found');

    const index = user.favoriteServices.indexOf(serviceName);
    let message = '';

    if (index > -1) {
      user.favoriteServices.splice(index, 1);
      message = `Removed '${serviceName}' from favorites`;
    } else {
      user.favoriteServices.push(serviceName);
      message = `Added '${serviceName}' to favorites`;
    }

    await user.save();
    return { message, favorites: user.favoriteServices };
  }

  // 5. BOOKING HISTORY FILTERS
  async getBookingHistory(customer) {
    return await bookingRepository.find({ customer: customer._id }, '', { createdAt: -1 });
  }

  async getUpcomingBookings(customer) {
    return await bookingRepository.find(
      { customer: customer._id, status: { $in: ['pending', 'assigned', 'in_progress'] } },
      '',
      { createdAt: -1 }
    );
  }

  async getCompletedBookings(customer) {
    return await bookingRepository.find(
      { customer: customer._id, status: 'completed' },
      '',
      { createdAt: -1 }
    );
  }

  async getCancelledBookings(customer) {
    return await bookingRepository.find(
      { customer: customer._id, status: 'cancelled' },
      '',
      { createdAt: -1 }
    );
  }

  // 6. REFERRAL & EARN (Database Live Integration & SuperAdmin Configuration)
  async getReferralData(customer) {
    const user = await userRepository.findById(customer._id);
    if (!user) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Customer user not found');

    // 1. Fetch SuperAdmin Global Referral Settings from MongoDB
    let settings = await SystemSettings.findOne({ key: 'global_settings' });
    if (!settings) {
      settings = await SystemSettings.create({ key: 'global_settings', referralBonusAmount: 200 });
    }
    const rewardPerReferral = settings.referralBonusAmount || 200;

    // 2. Generate unique referralCode PER USER if not already generated
    if (!user.referralCode || user.referralCode === 'ANANYA200' || user.referralCode.includes('CUSTOMER')) {
      const cleanSeed = (user.name || user.email || 'USER').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 5) || 'NRZ';
      const randomFour = Math.floor(1000 + Math.random() * 9000);
      user.referralCode = `${cleanSeed}${randomFour}`;
      await user.save();
    }

    const invitedCount = user.referralInvitedCount || 0;
    const joinedCount = user.referralJoinedCount || 0;
    const totalEarned = user.referralEarnings || (joinedCount * rewardPerReferral);
    const referralsList = user.referralsList || [];

    return {
      referralCode: user.referralCode,
      rewardPerReferral,
      stats: {
        invitedCount,
        joinedCount,
        earnedAmount: totalEarned,
      },
      referralsList,
    };
  }

  async sendReferralInvite(customer, friendInfo) {
    const user = await userRepository.findById(customer._id);
    if (!user) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Customer user not found');

    const name = friendInfo.friendName || friendInfo.phoneOrEmail || 'Friend';
    const newRef = {
      id: `ref_${Date.now()}`,
      name,
      date: `Invited on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
      status: 'Pending',
      reward: 0
    };

    if (!user.referralsList) user.referralsList = [];
    user.referralsList.unshift(newRef);
    user.referralInvitedCount = (user.referralInvitedCount || 0) + 1;
    await user.save();

    return {
      message: `Invitation successfully sent to ${name}!`,
      referralCode: user.referralCode,
      referral: newRef
    };
  }
}

export const customerDashboardService = new CustomerDashboardService();
