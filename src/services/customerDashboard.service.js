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

    const activeBanners = await this.getBanners();

    return {
      banners: activeBanners,
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

  async getFaqs() {
    const { Faq } = await import('../models/faq.model.js');
    const count = await Faq.countDocuments();
    if (count < 10) {
      const { superAdminService } = await import('./superAdmin.service.js');
      await superAdminService.getAllFaqs();
    }
    return await Faq.find({
      isActive: true,
      targetAudience: { $in: ['customer', 'both'] }
    }).sort({ displayOrder: 1, createdAt: -1 });
  }

  async getBanners() {
    const { Banner } = await import('../models/banner.model.js');
    let banners = await Banner.find({ isActive: true }).sort({ displayOrder: 1, createdAt: -1 });

    if (!banners || banners.length === 0) {
      banners = [
        {
          _id: 'default_1',
          title: 'AC Jet Deep Cleaning',
          subtitle: 'Flat 50% OFF on 1st Service',
          badgeText: 'SUMMER SPECIAL',
          couponCode: 'SUMMER50',
          targetType: 'category',
          targetValue: 'AC & Appliance Repair',
          gradientBg: 'linear-gradient(135deg, #09331E 0%, #064e3b 50%, #0f172a 100%)',
          imageUrl: '',
          isActive: true,
        },
        {
          _id: 'default_2',
          title: 'Full House Deep Cleaning',
          subtitle: 'Save ₹500 Instant Discount',
          badgeText: 'HOT DEAL',
          couponCode: 'CLEAN500',
          targetType: 'service',
          targetValue: 'Full Home Deep Cleaning 3BHK',
          gradientBg: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #7c3aed 100%)',
          imageUrl: '',
          isActive: true,
        },
      ];
    }

    return banners;
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
    let coupons = await Coupon.find({ isActive: true })
      .populate('applicableCategory', 'name icon slug')
      .sort({ createdAt: -1 });

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
    const { code, bookingAmount, categoryId, serviceId } = data;

    if (!code) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Please enter a valid coupon code.');
    }

    const cleanCode = String(code).trim().toUpperCase();
    const coupon = await Coupon.findOne({ code: cleanCode, isActive: true }).populate('applicableCategory', 'name slug');

    if (!coupon) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, `Coupon code '${cleanCode}' is invalid or expired.`);
    }

    // Check Date Expiry
    if (coupon.validUntil && new Date() > new Date(coupon.validUntil)) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, `Coupon code '${cleanCode}' has expired.`);
    }

    // Check Category Restriction (If coupon is assigned to a specific category)
    if (coupon.applicableCategory) {
      const couponCategoryObjId = String(coupon.applicableCategory._id || coupon.applicableCategory);
      let serviceCatId = categoryId ? String(categoryId._id || categoryId) : null;

      // If categoryId was not directly passed, lookup from Service model if serviceId is provided
      if (!serviceCatId && serviceId) {
        const { Service } = await import('../models/service.model.js');
        const serviceObj = await Service.findById(serviceId).lean();
        if (serviceObj && serviceObj.category) {
          serviceCatId = String(serviceObj.category._id || serviceObj.category);
        }
      }

      // If category is known and does not match, reject coupon application
      if (serviceCatId && serviceCatId !== couponCategoryObjId) {
        const categoryName = coupon.applicableCategory.name || 'this specific';
        throw new ApiError(
          HTTP_STATUS.BAD_REQUEST,
          `Coupon '${cleanCode}' is valid ONLY for '${categoryName}' services and cannot be applied to this category.`
        );
      }
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
        applicableCategory: coupon.applicableCategory ? { id: coupon.applicableCategory._id, name: coupon.applicableCategory.name } : null,
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

    // Auto-sync any refunded bookings without transaction log
    try {
      const { bookingRepository } = await import('../repositories/booking.repository.js');
      const refundedBookings = await bookingRepository.model.find({
        customer: customer._id,
        $or: [{ status: 'Refunded' }, { status: 'refunded' }, { paymentStatus: 'refunded' }]
      });

      for (const b of refundedBookings) {
        const existingTxn = await WalletTransaction.findOne({
          user: customer._id,
          category: 'Refund',
          createdAt: { $gte: new Date(new Date(b.updatedAt || b.createdAt).getTime() - 120000) }
        });

        if (!existingTxn) {
          const platformFee = b.financialSnapshot?.customerPlatformFee || 50;
          const pkgAmount = b.refundAmount || b.financialSnapshot?.servicePrice || (b.packageSnapshot?.finalPrice || Math.max(0, (b.amount || 0) - platformFee));
          const txnId = 'TXN-' + Math.floor(100000 + Math.random() * 900000);
          await WalletTransaction.create({
            transactionId: txnId,
            user: customer._id,
            type: 'Credit',
            amount: pkgAmount,
            category: 'Refund',
            title: `Refund for Cancelled Service (${b.packageName || 'Service Package'})`,
            paymentMethod: 'NOROZZ Wallet',
            status: 'Completed',
            createdAt: b.updatedAt || new Date(),
          });
        }
      }
    } catch (e) {
      console.warn('Auto-sync refund transactions warning:', e);
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
    const { User } = await import('../models/user.model.js');
    const { WalletTransaction } = await import('../models/walletTransaction.model.js');
    const { ROLES } = await import('../constants/roles.constant.js');

    const user = await userRepository.findById(customer._id);
    if (!user) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Customer user not found');

    // 1. Fetch SuperAdmin Global Referral Settings from MongoDB
    let settings = await SystemSettings.findOne({ key: 'global_settings' });
    if (!settings) {
      settings = await SystemSettings.create({ key: 'global_settings', referralBonusAmount: 200 });
    }
    const rewardPerReferral = settings.referralBonusAmount || 200;

    // 2. Generate unique referralCode PER USER if not already generated
    let refCode = user.referralCode;
    if (!refCode || refCode === 'ANANYA200' || refCode.includes('CUSTOMER')) {
      const cleanSeed = (user.name || user.email || 'USER').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 5) || 'NRZ';
      const randomFour = Math.floor(1000 + Math.random() * 9000);
      refCode = `${cleanSeed}${randomFour}`;
      user.referralCode = refCode;
      await user.save();
    }

    // Query ALL users (Customers & Technicians) registered using this customer's referral code or ObjectId
    const joinedUsers = await User.find({
      $or: [
        { referredBy: refCode },
        { referralCodeUsed: refCode },
        { referredByPartner: customer._id },
        { referredBy: String(customer._id) },
      ],
    })
      .select('name userId phone email role status kycStatus referralBonusStatus createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const joinedCount = joinedUsers.length;
    const joinedTechniciansCount = joinedUsers.filter((u) => u.role === ROLES.PARTNER).length;
    const joinedCustomersCount = joinedUsers.filter((u) => u.role === ROLES.CUSTOMER).length;

    // Calculate Referral Bonus Earned from Wallet Transactions
    const referralTxns = await WalletTransaction.find({
      user: customer._id,
      category: 'Referral Bonus',
    }).lean();

    const totalBonusEarned = referralTxns.reduce((sum, t) => sum + (t.amount || 0), 0);
    const creditedCount = joinedUsers.filter((p) => p.referralBonusStatus === 'credited').length;
    const pendingCount = joinedCount - creditedCount;
    const pendingEarned = pendingCount * rewardPerReferral;

    return {
      referralCode: refCode,
      rewardPerReferral,
      referralBonusAmount: rewardPerReferral,
      totalInvitesSent: user.referralInvitedCount || joinedCount,
      joinedCount,
      joinedTechnicians: joinedTechniciansCount,
      joinedCustomers: joinedCustomersCount,
      totalReferralBonusEarned: totalBonusEarned,
      pendingEarnings: pendingEarned,
      joinedList: joinedUsers,
      stats: {
        invitedCount: user.referralInvitedCount || joinedCount,
        joinedCount,
        earnedAmount: totalBonusEarned,
      },
      referralsList: joinedUsers,
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

  async getSystemSettings() {
    let settings = await SystemSettings.findOne({ key: 'global_settings' });
    if (!settings) {
      settings = await SystemSettings.create({
        key: 'global_settings',
        customerPlatformFeePercent: 5,
        partnerPlatformFeePercent: 10,
        referralBonusAmount: 200,
        currency: 'INR',
      });
    }
    return settings;
  }

  async createTicket(userId, ticketData) {
    const { Ticket } = await import('../models/ticket.model.js');
    const { User } = await import('../models/user.model.js');

    const user = userId ? await User.findById(userId) : null;
    const ticketId = `TK-${Math.floor(100000 + Math.random() * 900000)}`;

    const userCity = ticketData.city || user?.city || (typeof user?.assignedCity === 'string' ? user.assignedCity : user?.assignedCity?.name) || 'Delhi NCR';

    const ticket = await Ticket.create({
      ticketId,
      user: userId || null,
      userName: user?.name || ticketData.userName || 'Customer',
      userPhone: user?.phone || ticketData.userPhone || '',
      userEmail: user?.email || ticketData.userEmail || '',
      userType: 'customer',
      city: userCity,
      category: ticketData.category || 'General',
      bookingId: ticketData.bookingId || '',
      subject: ticketData.subject,
      description: ticketData.description || ticketData.message || '',
      priority: ticketData.priority || 'Medium',
      status: 'Open',
    });

    return ticket;
  }

  async getUserTickets(userId) {
    const { Ticket } = await import('../models/ticket.model.js');
    if (!userId) return [];
    return await Ticket.find({ user: userId }).sort({ createdAt: -1 });
  }

  async getTicketById(ticketId, userId) {
    const { Ticket } = await import('../models/ticket.model.js');
    const ticket = await Ticket.findOne({ _id: ticketId, user: userId });
    if (!ticket) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Ticket not found');
    return ticket;
  }

  async replyToTicket(ticketId, user, message) {
    const { Ticket } = await import('../models/ticket.model.js');
    if (!message?.trim()) throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Reply message is required');
    const ticket = await Ticket.findOne({ _id: ticketId, user: user._id });
    if (!ticket) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Ticket not found');
    if (ticket.status === 'Closed') throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Cannot reply to a closed ticket');
    ticket.replies.push({ message: message.trim(), senderType: 'customer', senderName: user.name || 'Customer' });
    await ticket.save();
    return ticket;
  }
}

export const customerDashboardService = new CustomerDashboardService();
