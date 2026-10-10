import mongoose from 'mongoose';
import { userRepository } from '../repositories/user.repository.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { Complaint } from '../models/complaint.model.js';
import { SupportChat } from '../models/supportChat.model.js';
import { WalletTransaction } from '../models/walletTransaction.model.js';
import { r2StorageService } from './r2Storage.service.js';
import bcrypt from 'bcryptjs';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { isWithinOperatingRadius } from '../utils/distance.util.js';
import { dispatchNewJobOffer } from '../sockets/index.js';

export class PartnerDashboardService {

  // Helper: Enforce KYC Approval check and Active Account check
  checkKycApproved(partner) {
    if (!partner) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Partner authentication required');
    }
    if (partner.status !== 'active') {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        'Your account is currently disabled/suspended. Please contact City Admin to reactivate your account.'
      );
    }
    if (partner.kycStatus !== 'approved') {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        'Your account is under verification. Only approved partners can access booking features.'
      );
    }
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
      targetAudience: { $in: ['partner', 'both'] }
    }).sort({ displayOrder: 1, createdAt: -1 });
  }

  // 1. DASHBOARD OVERVIEW & CARDS
  async getDashboardOverview(partner) {
    if (!partner) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Partner authentication required');
    }
    const isApproved = partner.kycStatus === 'approved';
    const isActive = partner.status === 'active';

    if (!isActive) {
      return {
        noticeMessage: 'Your account is disabled/suspended due to policy limits or cancellations. Contact City Admin to re-enable.',
        kycStatus: partner.kycStatus,
        status: partner.status,
        isBookingUnlocked: false,
        metrics: {
          todaysJobs: 0,
          pendingJobs: 0,
          completedJobs: 0,
          walletBalance: partner.walletBalance || 0,
          monthlyEarnings: 0,
          rating: '0.0',
          activeWorkers: 0,
        },
        recentBookings: [],
      };
    }

    if (!isApproved) {
      return {
        noticeMessage: 'Your account is under verification.',
        kycStatus: partner.kycStatus,
        isBookingUnlocked: false,
        metrics: {
          todaysJobs: 0,
          pendingJobs: 0,
          completedJobs: 0,
          walletBalance: 0,
          monthlyEarnings: 0,
          rating: '0.0',
          activeWorkers: 0,
        },
        recentBookings: [],
      };
    }

    // Helper query to match partner by ObjectId or String ID
    const partnerFilter = { $or: [{ partner: partner._id }, { partner: String(partner._id) }] };

    // If Approved Partner: Fetch real booking stats
    const partnerBookings = await bookingRepository.model
      .find(partnerFilter)
      .populate('category', 'name slug image')
      .populate('service', 'name slug price finalPrice duration')
      .populate('customer', 'name email phone')
      .sort({ createdAt: -1 });

    const todaysJobs = partnerBookings.filter(b => ['Assigned', 'Accepted', 'On The Way', 'Started', 'assigned', 'accepted', 'in_progress'].includes(b.status)).length;
    const pendingJobs = partnerBookings.filter(b => ['Pending', 'pending'].includes(b.status)).length;
    const completedBookingsList = partnerBookings.filter(b => ['Completed', 'completed'].includes(b.status));
    const completedJobs = completedBookingsList.length;

    const realNetEarnings = completedBookingsList.reduce((sum, b) => {
      const snapshot = b.financialSnapshot || {};
      const net = snapshot.partnerNetEarning ?? (b.amount ? (b.amount - Math.round(b.amount * 0.10)) : 359);
      return sum + net;
    }, 0);

    const activeWalletBalance = (partner?.walletBalance && partner.walletBalance > 0)
      ? partner.walletBalance
      : ((partner?.availableBalance && partner.availableBalance > 0)
          ? partner.availableBalance
          : realNetEarnings);

    const activeLifetimeEarnings = (partner?.lifetimeEarnings && partner.lifetimeEarnings > 0)
      ? partner.lifetimeEarnings
      : realNetEarnings;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const todayEarnings = completedBookingsList
      .filter(b => new Date(b.createdAt) >= startOfToday)
      .reduce((sum, b) => {
        const snapshot = b.financialSnapshot || {};
        return sum + (snapshot.partnerNetEarning ?? (b.amount ? (b.amount - Math.round(b.amount * 0.10)) : 359));
      }, 0);

    // Auto sync partner wallet on User document if 0 or un-synced
    if (partner && (partner.walletBalance === 0 || !partner.walletBalance) && realNetEarnings > 0) {
      partner.walletBalance = realNetEarnings;
      partner.availableBalance = realNetEarnings;
      partner.lifetimeEarnings = activeLifetimeEarnings;
      await partner.save().catch(() => {});
    }

    return {
      noticeMessage: 'Account Active & Operational',
      kycStatus: 'approved',
      isBookingUnlocked: true,
      metrics: {
        todayEarnings: todayEarnings,
        todayBookingsCount: todaysJobs,
        todaysJobs: todaysJobs,
        pendingJobs: pendingJobs,
        completedJobs: completedJobs,
        walletBalance: activeWalletBalance,
        monthlyEarnings: activeLifetimeEarnings,
        rating: partner?.averageRating ? partner.averageRating.toFixed(1) : '5.0',
        activeWorkers: 1,
      },
      recentBookings: partnerBookings.slice(0, 10),
    };
  }

  // 2. BOOKING APIS (Protected by Approved KYC Rule)
  async getTodayBookings(partner) {
    this.checkKycApproved(partner);
    return await bookingRepository.model
      .find({
        $or: [{ partner: partner._id }, { partner: String(partner._id) }],
        status: { $in: ['Assigned', 'Accepted', 'On The Way', 'Started', 'assigned', 'accepted', 'in_progress'] },
      })
      .populate('category', 'name slug image')
      .populate('service', 'name slug price finalPrice duration')
      .populate('customer', 'name email phone')
      .sort({ createdAt: -1 });
  }

  async getPendingBookings(partner) {
    this.checkKycApproved(partner);

    const rawCityVal = partner.assignedCity?.name || (typeof partner.assignedCity === 'string' ? partner.assignedCity : null) || partner.city || 'Jaunpur';
    const partnerCity = String(rawCityVal || 'Jaunpur').trim().toLowerCase();
    const partnerCatId = partner.category?._id ? String(partner.category._id) : String(partner.category || '');
    const partnerCats = Array.isArray(partner.categories) ? partner.categories.map((c) => String(c._id || c)) : [];

    // Query all open unassigned pending bookings from DB
    const openBookings = await bookingRepository.model
      .find({
        partner: null,
        status: { $in: ['Pending', 'pending'] },
      })
      .populate('category', 'name slug image')
      .populate('service', 'name slug price finalPrice duration')
      .populate('customer', 'name email phone')
      .sort({ createdAt: -1 });

    // Filter strictly by Category, Offered Services, and Work Area / City
    return openBookings.filter((b) => {
      // 1. Category check
      const bCatId = b.category?._id ? String(b.category._id) : String(b.category || '');
      const isCatMatch = !partnerCatId || partnerCatId === bCatId || partnerCats.includes(bCatId);
      if (!isCatMatch) return false;

      // 2. Offered Services check: If partner selected specific offeredServices, verify serviceId is present
      if (Array.isArray(partner.offeredServices) && partner.offeredServices.length > 0 && b.service) {
        const bSvcId = b.service?._id ? String(b.service._id) : String(b.service);
        const pServices = partner.offeredServices.map((s) => String(s._id || s));
        if (!pServices.includes(bSvcId)) return false;
      }

      // 3. Geographic Operating Radius Match (locationCoordinates distance <= serviceRadius KM)
      const partnerCoords = partner.locationCoordinates || partner.location;
      const bookingCoords = b.address?.locationCoordinates || b.locationCoordinates;
      const partnerRadius = partner.serviceRadius || partner.workRadius || partner.operatingRadius || 8;

      const { isWithinRadius } = isWithinOperatingRadius(partnerCoords, bookingCoords, partnerRadius);
      if (!isWithinRadius) return false;

      return true;
    });
  }

  async getCompletedBookings(partner) {
    this.checkKycApproved(partner);
    return await bookingRepository.model
      .find({
        $or: [{ partner: partner._id }, { partner: String(partner._id) }],
        status: { $in: ['Completed', 'completed'] },
      })
      .populate('category', 'name slug image')
      .populate('service', 'name slug price finalPrice duration')
      .populate('customer', 'name email phone')
      .sort({ createdAt: -1 });
  }

  async getCancelledBookings(partner) {
    this.checkKycApproved(partner);
    return await bookingRepository.model
      .find({
        $or: [
          { partner: partner._id },
          { partner: String(partner._id) },
          { cancelledByPartners: partner._id }
        ],
      })
      .populate('category', 'name slug image')
      .populate('service', 'name slug price finalPrice duration')
      .populate('customer', 'name email phone')
      .sort({ createdAt: -1 });
  }

  async getAllBookings(partner) {
    this.checkKycApproved(partner);

    // Return this partner's own claimed / assigned bookings AND bookings cancelled by this partner
    return await bookingRepository.model
      .find({
        $or: [
          { partner: partner._id },
          { partner: String(partner._id) },
          { cancelledByPartners: partner._id }
        ],
      })
      .populate('category', 'name slug image')
      .populate('service', 'name slug price finalPrice duration')
      .populate('customer', 'name email phone rating createdAt')
      .sort({ createdAt: -1 });
  }

  async getBookingDetails(partner, bookingId) {
    this.checkKycApproved(partner);
    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Booking not found');
    }
    const booking = await bookingRepository.model
      .findOne({
        _id: bookingId,
        $or: [
          { partner: partner._id },
          { partner: String(partner._id) },
          { partner: null, status: { $in: ['Pending', 'pending'] } },
        ],
      })
      .populate('category', 'name slug image')
      .populate('service', 'name slug price finalPrice duration description')
      .populate('customer', 'name email phone rating createdAt')
      .populate({
        path: 'partner',
        select: 'name agencyName phone profileImage rating city offeredServices',
        populate: { path: 'offeredServices', select: 'name title price description' }
      });

    if (!booking) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Booking not found or no longer available');
    }

    // Fetch customer's last 3 service history items
    const customerHistory = await bookingRepository.model
      .find({ customer: booking.customer._id })
      .sort({ createdAt: -1 })
      .limit(3)
      .select('bookingNumber packageName serviceName totalAmount amount status createdAt');

    const bookingObj = booking.toObject();
    bookingObj.customerHistory = customerHistory;

    return bookingObj;
  }

  // 3. WALLET & EARNINGS
  async getWallet(partner) {
    const p = await userRepository.findById(partner._id);

    // Auto-delete legacy seeded dummy transactions from MongoDB for this partner
    await WalletTransaction.deleteMany({
      partnerId: partner._id,
      transactionId: { $regex: /^TXN-.*-(9081|9080|9079|9078)/ }
    });

    const transactions = await WalletTransaction.find({ partnerId: partner._id }).sort({ createdAt: -1 });

    const completedBookings = await bookingRepository.model.find({
      $or: [{ partner: partner._id }, { partner: String(partner._id) }],
      status: { $in: ['Completed', 'completed'] },
    });

    const realLifetimeEarned = completedBookings.reduce(
      (sum, b) => {
        const snapshot = b.financialSnapshot || {};
        const net = snapshot.partnerNetEarning ?? (b.amount ? (b.amount - Math.round(b.amount * 0.10)) : 359);
        return sum + net;
      },
      0
    );

    // Auto-clean legacy unverified balance or 0 balance when completed jobs exist
    if (p && (p.walletBalance === 0 || !p.walletBalance || p.walletBalance === 13209 || p.walletBalance === 12450) && realLifetimeEarned > 0) {
      p.walletBalance = realLifetimeEarned;
      p.availableBalance = realLifetimeEarned;
      p.withdrawableBalance = realLifetimeEarned;
      p.lifetimeEarnings = realLifetimeEarned;
      await p.save().catch(() => {});
    }

    const currentBal = (p?.walletBalance && p.walletBalance > 0 && p.walletBalance !== 13209 && p.walletBalance !== 12450)
      ? p.walletBalance
      : realLifetimeEarned;

    return {
      partnerId: partner._id,
      walletBalance: currentBal,
      securityDeposit: p?.securityDeposit ?? 0,
      pendingClearance: p?.pendingBalance ?? 0,
      totalEarned: p?.lifetimeEarnings || realLifetimeEarned,
      bankDetails: p?.bankDetails || {},
      transactions,
    };
  }

  async getEarnings(partner) {
    const p = await userRepository.findById(partner._id);

    // Query real completed bookings from MongoDB
    const completedBookings = await bookingRepository.model
      .find({
        $or: [{ partner: partner._id }, { partner: String(partner._id) }],
        status: { $in: ['Completed', 'completed'] },
      })
      .populate('customer', 'name email phone')
      .sort({ updatedAt: -1 });

    const realTotalJobs = completedBookings.length;
    const realTotalEarned = completedBookings.reduce(
      (sum, b) => sum + (b.totalAmount || b.amount || b.finalPrice || 0),
      0
    );

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todaysCompleted = completedBookings.filter(
      (b) => new Date(b.updatedAt || b.createdAt) >= startOfToday
    );

    const totalEarnedToday = todaysCompleted.reduce(
      (sum, b) => sum + (b.totalAmount || b.amount || b.finalPrice || 0),
      0
    );

    const todayFormattedJobs = todaysCompleted.map((b) => ({
      id: b.bookingNumber || `JOB-${b._id.toString().slice(-4)}`,
      serviceName: b.serviceName || b.packageName || 'Service Job',
      customerName: b.customer?.name || 'Customer',
      time: new Date(b.updatedAt || b.createdAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      amount: b.totalAmount || b.amount || b.finalPrice || 0,
    }));

    return {
      partnerId: partner._id,
      overview: {
        totalEarned: realTotalEarned,
        totalJobs: realTotalJobs,
        avgPerJob: realTotalJobs > 0 ? Math.round(realTotalEarned / realTotalJobs) : 0,
        monthlyTrend: [
          { month: 'Jan', val: 0, height: '0%' },
          { month: 'Feb', val: 0, height: '0%' },
          { month: 'Mar', val: 0, height: '0%' },
          { month: 'Apr', val: 0, height: '0%' },
          { month: 'May', val: 0, height: '0%' },
          { month: 'Jun', val: 0, height: '0%' },
          { month: 'Jul', val: realTotalEarned, height: realTotalEarned > 0 ? '100%' : '0%' },
        ],
      },
      daily: {
        dateLabel: 'Today',
        totalEarnedToday,
        percentageChange: '0%',
        hourlyActivity: [
          { hour: '9 AM', val: 0 },
          { hour: '11 AM', val: 0 },
          { hour: '1 PM', val: 0 },
          { hour: '3 PM', val: 0 },
          { hour: '5 PM', val: 0 },
          { hour: '7 PM', val: 0 },
        ],
        completedJobs: todayFormattedJobs,
      },
      weekly: {
        weekLabel: 'Current Week',
        totalEarnedWeek: realTotalEarned,
        percentageChange: '0%',
        dailyBreakdown: [
          { day: 'Mon', val: 0 },
          { day: 'Tue', val: 0 },
          { day: 'Wed', val: 0 },
          { day: 'Thu', val: 0 },
          { day: 'Fri', val: 0 },
          { day: 'Sat', val: 0 },
          { day: 'Sun', val: 0 },
        ],
        busiestDay: realTotalJobs > 0 ? 'Active' : 'None',
        busiestDayDetails: realTotalJobs > 0 ? `You completed ${realTotalJobs} service jobs` : 'No completed jobs this week yet',
      },
      monthly: {
        monthLabel: 'Current Month',
        totalEarnedMonth: realTotalEarned,
        percentageChange: '0%',
        weeklyBreakdown: [
          { week: 'W1', val: 0 },
          { week: 'W2', val: 0 },
          { week: 'W3', val: 0 },
          { week: 'W4', val: realTotalEarned },
        ],
        avgWeeklyEarned: Math.round(realTotalEarned / 4),
        activeDays: realTotalJobs,
        payoutDestination: `${p?.bankDetails?.bankName || 'Bank Account'} ${p?.bankDetails?.accountNumber ? `•••• ${p.bankDetails.accountNumber.slice(-4)}` : ''}`,
      },
    };
  }

  async requestWithdrawal(partnerId, amount) {
    const user = await userRepository.findById(partnerId);
    if (!user) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Partner user not found');
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Please enter a valid withdrawal amount');
    }
    const currentBalance = user.walletBalance || 0;
    if (numAmount > currentBalance) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, `Insufficient wallet balance. Available: ₹${currentBalance.toLocaleString('en-IN')}`);
    }

    user.walletBalance = currentBalance - numAmount;
    await user.save();

    const txnId = `TXN-${Math.floor(100000 + Math.random() * 900000)}`;
    const txn = await WalletTransaction.create({
      transactionId: txnId,
      partnerId: user._id,
      type: 'Debit',
      category: 'Bank Withdrawal',
      title: `Instant Bank Payout to ${user.bankDetails?.bankName || 'HDFC Bank'}`,
      amount: numAmount,
      status: 'Completed',
    });

    return {
      message: `₹${numAmount.toLocaleString('en-IN')} transferred successfully to your bank account!`,
      walletBalance: user.walletBalance,
      transaction: txn,
    };
  }

  async addDepositToWallet(partnerId, amount) {
    const user = await userRepository.findById(partnerId);
    if (!user) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Partner user not found');
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Please enter a valid deposit amount');
    }

    user.walletBalance = (user.walletBalance || 0) + numAmount;
    await user.save();

    const txnId = `TXN-${Math.floor(100000 + Math.random() * 900000)}`;
    const txn = await WalletTransaction.create({
      transactionId: txnId,
      partnerId: user._id,
      type: 'Credit',
      category: 'Added to Wallet',
      title: 'Partner Wallet Deposit / Top-up',
      amount: numAmount,
      status: 'Completed',
    });

    return {
      message: `₹${numAmount.toLocaleString('en-IN')} successfully added to your wallet!`,
      walletBalance: user.walletBalance,
      transaction: txn,
    };
  }

  // 4. RATING & REVIEWS
  async getRating(partner) {
    return {
      averageRating: 4.85,
      totalRatings: 142,
      fiveStar: 118,
      fourStar: 18,
      threeStar: 4,
      twoStar: 2,
      oneStar: 0,
    };
  }

  async getReviews(partner) {
    return [
      { id: 'REV-1', customer: 'Ananya Deshmukh', rating: 5, comment: 'Punctual, professional AC foam cleaning. Highly recommended!', date: '27 July 2026' },
      { id: 'REV-2', customer: 'Vikram Mehta', rating: 4.8, comment: 'Great job with house deep cleaning.', date: '25 July 2026' },
    ];
  }

  // 5. PROFILE & AVAILABILITY MANAGEMENT
  async getProfile(partner) {
    const p = await userRepository.model
      .findById(partner._id)
      .populate('offeredServices', 'name title slug');
    if (!p) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Partner profile not found');
    }
    const obj = p.toObject();
    delete obj.password;
    return obj;
  }

  async updateProfile(partnerId, updateData = {}) {
    const cleanData = { ...updateData };
    delete cleanData.email;
    delete cleanData.phone;

    // Upload base64 profile image to Cloudflare R2 storage and save public URL in DB
    if (cleanData.profileImage && typeof cleanData.profileImage === 'string' && cleanData.profileImage.startsWith('data:image')) {
      try {
        cleanData.profileImage = await r2StorageService.uploadBase64Image(cleanData.profileImage, 'norozz_partner_profiles');
      } catch (err) {
        console.warn('R2 Storage upload notice:', err);
      }
    }

    const updated = await userRepository.updateById(partnerId, cleanData);
    const obj = updated.toObject();
    delete obj.password;
    return obj;
  }

  async getAvailability(partner) {
    return {
      partnerId: partner._id,
      isOnline: true,
      workingHours: '09:00 AM - 08:00 PM',
      workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    };
  }

  async updateAvailability(partnerId, { isOnline, workingHours }) {
    const p = await userRepository.findById(partnerId);
    if (p && p.status !== 'active' && isOnline) {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        'Your account is currently disabled/suspended. You cannot switch to Online mode. Please contact City Admin.'
      );
    }

    const updateData = {};
    if (isOnline !== undefined) updateData.isOnline = Boolean(isOnline);
    if (workingHours) updateData.workingHours = workingHours;

    const updatedUser = await userRepository.updateById(partnerId, updateData);
    return {
      message: `Technician status updated to ${updatedUser?.isOnline ? 'ONLINE' : 'OFFLINE'}`,
      isOnline: updatedUser?.isOnline ?? isOnline,
      workingHours: updatedUser?.workingHours || '09:00 AM - 08:00 PM',
    };
  }

  // 6. DOCUMENTS & NOTIFICATIONS
  async getDocuments(partner) {
    const p = await userRepository.findById(partner._id);
    return {
      kycStatus: p.kycStatus,
      documents: p.documents,
      profileImage: p.profileImage,
    };
  }

  async getNotifications(partner) {
    return [
      { id: 'NOTIF-1', title: 'KYC Document Received', message: 'Your documents are under review by City Admin.', time: '2 hours ago' },
      { id: 'NOTIF-2', title: 'Welcome to NOROZZ', message: 'Complete your profile to start receiving bookings.', time: '1 day ago' },
    ];
  }

  // 7. SETTINGS PREFERENCES
  async updateSettingsPreferences(partnerId, data = {}) {
    const update = {};
    if (data.notificationPreferences) update.notificationPreferences = data.notificationPreferences;
    if (data.privacySecurity) update.privacySecurity = data.privacySecurity;
    if (data.preferredLanguage) update.preferredLanguage = data.preferredLanguage;

    const updatedUser = await userRepository.updateById(partnerId, update);
    return {
      message: 'Settings preferences saved successfully',
      notificationPreferences: updatedUser.notificationPreferences,
      privacySecurity: updatedUser.privacySecurity,
      preferredLanguage: updatedUser.preferredLanguage,
    };
  }

  // 8. CHANGE PASSWORD
  async changePassword(partnerId, { currentPassword, newPassword }) {
    const user = await userRepository.model.findById(partnerId).select('+password');
    if (!user) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'User partner not found');
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Current password entered is incorrect');
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return { message: 'Password updated successfully' };
  }

  // 9. COMPLAINTS & TICKETS
  async submitComplaint(partnerId, { complaintType, bookingId, description, priority, screenshot }) {
    const { User } = await import('../models/user.model.js');
    const { Ticket } = await import('../models/ticket.model.js');

    const partner = await User.findById(partnerId).populate('assignedCity');
    const ticketId = `TKT-${Math.floor(100000 + Math.random() * 900000)}`;
    const complaint = await Complaint.create({
      ticketId,
      partnerId,
      complaintType,
      bookingId: bookingId || '',
      description,
      priority: priority || 'Medium',
      screenshot: screenshot || '',
      status: 'Open',
    });

    // Also populate unified Ticket collection for Super Admin & City Admin dashboards
    const partnerCity = partner?.assignedCity?.name || (typeof partner?.assignedCity === 'string' ? partner?.assignedCity : null) || partner?.city || 'Delhi NCR';
    await Ticket.create({
      ticketId,
      user: partnerId,
      userName: partner?.name || 'Partner Technician',
      userPhone: partner?.phone || '',
      userEmail: partner?.email || '',
      userType: 'partner',
      city: partnerCity,
      category: complaintType || 'Partner Issue',
      bookingId: bookingId || '',
      subject: `${complaintType || 'Partner Complaint'} (${bookingId || 'General'})`,
      description: description,
      priority: priority || 'Medium',
      status: 'Open',
    });

    return complaint;
  }

  async getComplaints(partnerId) {
    const complaints = await Complaint.find({ partnerId }).sort({ createdAt: -1 });
    return complaints;
  }

  // 10. LIVE SUPPORT CHAT
  async getChatMessages(partnerId) {
    let messages = await SupportChat.find({ partnerId }).sort({ createdAt: 1 });
    if (messages.length === 0) {
      // Seed default welcome message from agent
      const defaultMsg = await SupportChat.create({
        partnerId,
        sender: 'agent',
        agentName: 'Neha Sharma',
        text: 'Namaste! I am Neha from NOROZZ Partner support. How can I help you today?',
      });
      messages = [defaultMsg];
    }
    return messages;
  }

  async sendChatMessage(partnerId, { text, attachment }) {
    const userMsg = await SupportChat.create({
      partnerId,
      sender: 'user',
      text,
      attachment: attachment || '',
    });

    // Auto-reply simulation saved in DB
    const agentMsg = await SupportChat.create({
      partnerId,
      sender: 'agent',
      agentName: 'Neha Sharma',
      text: 'Thanks for sending that detail! Our partner support team is reviewing it right now.',
    });

    return [userMsg, agentMsg];
  }

  // 11. REFERRAL PROGRAM
  async getReferralData(partner) {
    const { SystemSettings } = await import('../models/systemSettings.model.js');
    const { User } = await import('../models/user.model.js');
    const { ROLES } = await import('../constants/roles.constant.js');

    let settings = await SystemSettings.findOne({ key: 'global_settings' });
    const bonusAmount = settings?.referralBonusAmount ?? 500;

    let refCode = partner.referralCode;
    if (!refCode) {
      refCode = `NRZ-REF-${(partner.phone || partner._id.toString()).slice(-6).toUpperCase()}`;
      await User.updateOne({ _id: partner._id }, { referralCode: refCode }).catch(() => {});
    }

    // Query ALL users (Customers & Technicians) registered using this partner's referral code or ObjectId
    const joinedUsers = await User.find({
      $or: [
        { referredBy: refCode },
        { referralCodeUsed: refCode },
        { referredByPartner: partner._id },
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
      partnerId: partner._id,
      category: 'Referral Bonus',
    }).lean();

    const totalBonusEarned = referralTxns.reduce((sum, t) => sum + (t.amount || 0), 0);
    const creditedCount = joinedUsers.filter((p) => p.referralBonusStatus === 'credited').length;
    const pendingCount = joinedCount - creditedCount;
    const pendingEarned = pendingCount * bonusAmount;

    return {
      referralCode: refCode,
      referralBonusAmount: bonusAmount,
      totalInvitesSent: joinedCount,
      joinedCount,
      joinedTechnicians: joinedTechniciansCount,
      joinedCustomers: joinedCustomersCount,
      totalReferralBonusEarned: totalBonusEarned,
      pendingEarnings: pendingEarned,
      joinedList: joinedUsers,
    };
  }

  // 12. PARTNER OFFERED SERVICES (FETCH DYNAMIC EXTRA SERVICES LIST)
  async getOfferedServices(partnerUser, query = {}) {
    const { User } = await import('../models/user.model.js');
    const { Service } = await import('../models/service.model.js');
    const { ServicePackage } = await import('../models/servicePackage.model.js');
    const { Booking } = await import('../models/booking.model.js');

    const offeredList = [];

    // 1. Fetch full partner user with offeredServices
    const partner = await User.findById(partnerUser._id).populate({
      path: 'offeredServices',
      populate: { path: 'category subCategory' }
    });

    let booking = null;
    if (query.bookingId) {
      booking = await Booking.findById(query.bookingId).populate('service category').lean();
    }

    // 2. If partner has explicit offeredServices configured
    if (partner?.offeredServices && partner.offeredServices.length > 0) {
      for (const srv of partner.offeredServices) {
        if (srv.status === 'active' || !srv.status) {
          const packages = await ServicePackage.find({ service: srv._id, status: 'active' }).lean();
          if (packages.length > 0) {
            packages.forEach(pkg => {
              offeredList.push({
                id: `pkg_${pkg._id}`,
                serviceId: srv._id,
                packageId: pkg._id,
                name: `${srv.name} (${pkg.title})`,
                title: pkg.title,
                desc: pkg.description || srv.description || 'Professional add-on service package',
                price: pkg.finalPrice || pkg.price || srv.finalPrice || srv.price || 499,
                finalPrice: pkg.finalPrice || pkg.price || srv.finalPrice || srv.price || 499,
                category: srv.category?.name || 'Authorized Offered Service'
              });
            });
          } else {
            offeredList.push({
              id: `srv_${srv._id}`,
              serviceId: srv._id,
              packageId: null,
              name: srv.name,
              title: 'Standard',
              desc: srv.description || 'Standard extra service add-on',
              price: srv.finalPrice || srv.price || 399,
              finalPrice: srv.finalPrice || srv.price || 399,
              category: srv.category?.name || 'Authorized Offered Service'
            });
          }
        }
      }
    }

    // 3. If offeredList is empty or booking category query
    if (offeredList.length === 0) {
      const filter = { status: 'active' };
      if (booking?.category?._id || booking?.category) {
        filter.category = booking.category._id || booking.category;
      }

      const activeServices = await Service.find(filter).limit(10).lean();
      for (const srv of activeServices) {
        const packages = await ServicePackage.find({ service: srv._id, status: 'active' }).lean();
        if (packages.length > 0) {
          packages.forEach(pkg => {
            offeredList.push({
              id: `pkg_${pkg._id}`,
              serviceId: srv._id,
              packageId: pkg._id,
              name: `${srv.name} (${pkg.title})`,
              title: pkg.title,
              desc: pkg.description || srv.description || 'Professional extra service package',
              price: pkg.finalPrice || pkg.price || 499,
              finalPrice: pkg.finalPrice || pkg.price || 499,
              category: 'Catalog Offered Service'
            });
          });
        } else {
          offeredList.push({
            id: `srv_${srv._id}`,
            serviceId: srv._id,
            packageId: null,
            name: srv.name,
            title: 'Standard',
            desc: srv.description || 'Professional extra service add-on',
            price: srv.finalPrice || srv.price || 399,
            finalPrice: srv.finalPrice || srv.price || 399,
            category: 'Catalog Offered Service'
          });
        }
      }
    }

    // 4. Default Domain Fallbacks if less than 3
    if (offeredList.length < 3) {
      const bTitle = (booking?.serviceName || booking?.service?.name || '').toLowerCase();
      if (bTitle.includes('salon') || bTitle.includes('hair') || bTitle.includes('beauty') || bTitle.includes('nail') || bTitle.includes('shave') || bTitle.includes('trim')) {
        offeredList.push(
          { id: 'off_salon_1', serviceId: null, packageId: null, name: '✨ Nail Art (Basic Nail Art)', title: 'Basic Nail Art', desc: 'Professional glitter & gel polish styling', price: 499, finalPrice: 499, category: 'Salon & Beauty' },
          { id: 'off_salon_2', serviceId: null, packageId: null, name: '💆 Organic Herbal Hair Spa', title: 'Hair Spa', desc: 'Nourishing deep conditioning treatment', price: 799, finalPrice: 799, category: 'Salon & Beauty' },
          { id: 'off_salon_3', serviceId: null, packageId: null, name: '✨ Fruit Facial Glow Clean-up', title: 'Fruit Facial', desc: 'Instant radiance & dead skin removal', price: 599, finalPrice: 599, category: 'Salon & Beauty' }
        );
      } else {
        offeredList.push(
          { id: 'off_ac_1', serviceId: null, packageId: null, name: '❄️ Refrigerant Gas Refill (R32)', title: 'Gas Refill', desc: 'Eco-friendly high cooling gas top-up', price: 1200, finalPrice: 1200, category: 'AC & Appliance' },
          { id: 'off_ac_2', serviceId: null, packageId: null, name: '🧼 AC Foam Filter Deep Cleaning', title: 'Foam Wash', desc: 'Antibacterial jet spray foam wash', price: 400, finalPrice: 400, category: 'AC & Appliance' },
          { id: 'off_ac_3', serviceId: null, packageId: null, name: '⚡ Voltage Stabilizer Health Audit', title: 'Stabilizer Check', desc: 'Safety fuse & voltage output testing', price: 200, finalPrice: 200, category: 'AC & Appliance' }
        );
      }
    }

    return offeredList;
  }

  // 13. PARTNER CANCEL ACCEPTED BOOKING & AUTO RE-DISPATCH VIA SOCKET.IO
  async cancelAcceptedBooking(partner, bookingId, { reason, note } = {}) {
    this.checkKycApproved(partner);

    const booking = await bookingRepository.model.findById(bookingId);
    if (!booking) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Booking request not found');
    }

    // Verify booking is assigned to this partner or claimed by this partner
    const isAssigned = String(booking.partner) === String(partner._id);
    if (!isAssigned) {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        'You cannot cancel a booking that is not assigned to you.'
      );
    }

    // Prevent cancellation if booking is already completed, cancelled, or refunded
    if (['Completed', 'completed', 'Cancelled', 'cancelled', 'Refunded', 'refunded'].includes(booking.status)) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        'This booking has already been completed or cancelled.'
      );
    }

    const cancelReasonStr = reason ? `${reason}${note ? ` - ${note}` : ''}` : (note || 'Partner cancelled accepted booking request');

    // Add partner ID to cancelledByPartners to prevent re-dispatching to this partner
    booking.cancelledByPartners = booking.cancelledByPartners || [];
    if (!booking.cancelledByPartners.some((id) => String(id) === String(partner._id))) {
      booking.cancelledByPartners.push(partner._id);
    }

    // Reset booking state so it becomes an open pending offer again
    booking.partner = null;
    booking.status = 'Pending';
    booking.otpVerified = false;
    booking.startedAt = null;
    booking.cancellationReason = cancelReasonStr;
    booking.cancelledBy = 'partner';
    await booking.save();

    // Check Daily Cancellation Limit & Apply Penalty / Suspension
    const { SystemSettings } = await import('../models/systemSettings.model.js');
    const settings = await SystemSettings.findOne({ key: 'global_settings' });
    const maxDailyAllowed = settings?.maxDailyFreeCancellations ?? 3;
    const penaltyAmount = settings?.partnerCancellationPenaltyAmount ?? 100;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const todayCancellationsCount = await bookingRepository.model.countDocuments({
      cancelledByPartners: partner._id,
      updatedAt: { $gte: startOfToday },
    });

    let isPenaltyApplied = false;
    let isSuspended = false;

    // 1. Penalty fee is charged on EVERY cancellation
    const pUser = await userRepository.findById(partner._id);
    if (pUser) {
      pUser.walletBalance = (pUser.walletBalance || 0) - penaltyAmount;
      isPenaltyApplied = true;

      // 2. Account is disabled/suspended if cancellations today exceed maxDailyAllowed (e.g. > 3)
      if (todayCancellationsCount > maxDailyAllowed) {
        pUser.status = 'suspended';
        pUser.isOnline = false;
        isSuspended = true;
      }

      await pUser.save();

      // 3. Record Wallet Debit Transaction Log
      try {
        const { WalletTransaction } = await import('../models/walletTransaction.model.js');
        const txnId = `PEN-${Math.floor(100000 + Math.random() * 900000)}`;
        await WalletTransaction.create({
          transactionId: txnId,
          partnerId: pUser._id,
          type: 'Debit',
          category: 'Cancellation Penalty',
          title: `Cancellation Penalty Fee (#${todayCancellationsCount} cancellation today)`,
          amount: penaltyAmount,
          status: 'Completed',
        });
      } catch (txnErr) {
        console.error('Error logging cancellation penalty transaction:', txnErr);
      }
    }

    let responseMsg = `Booking cancelled. ₹${penaltyAmount} penalty fee deducted from your wallet.`;
    if (isSuspended) {
      responseMsg = `⚠️ Daily cancellation limit exceeded (${todayCancellationsCount} cancellations today)! ₹${penaltyAmount} penalty fee debited, and your account has been temporarily suspended. Please contact Admin.`;
    }

    // Populate booking details for real-time Socket.IO dispatch
    const populatedBooking = await bookingRepository.model
      .findById(booking._id)
      .populate('category', 'name slug image')
      .populate('service', 'name slug price finalPrice duration')
      .populate('customer', 'name email phone');

    // Trigger Real-Time Socket.io Dispatch to all other eligible online partners
    try {
      dispatchNewJobOffer(populatedBooking).catch((err) => {
        console.error('Socket re-dispatch error on partner cancellation:', err);
      });
    } catch (e) {
      console.warn('Could not execute Socket re-dispatch:', e);
    }

    // Notify customer socket channel if connected
    try {
      const io = (await import('../sockets/index.js')).getIO();
      if (io && populatedBooking.customer) {
        const custIdStr = String(populatedBooking.customer._id || populatedBooking.customer);
        io.to(`customer_${custIdStr}`).to(`user_${custIdStr}`).emit('partner_unassigned', {
          bookingId: booking._id,
          bookingNumber: booking.bookingId,
          message: 'Assigned technician had an emergency. Searching for another verified technician in your area...',
          status: 'Pending',
        });
      }
    } catch (e) {
      console.warn('Customer socket notification notice:', e);
    }

    return {
      message: responseMsg,
      bookingId: booking._id,
      status: 'Pending',
      todayCancellationsCount,
      maxDailyFree: maxDailyAllowed,
      penaltyAmount,
      isPenaltyApplied,
      isSuspended,
    };
  }

  // 14. GET PARTNER PERFORMANCE & REVENUE ANALYTICS DATA
  async getAnalytics(partner, { period = 'thisMonth' } = {}) {
    const p = await userRepository.findById(partner._id);
    const partnerId = partner._id;

    // Define Date Ranges
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    let startDate, endDate, prevStartDate, prevEndDate;
    if (period === 'lastMonth') {
      startDate = startOfLastMonth;
      endDate = endOfLastMonth;
      prevStartDate = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0);
      prevEndDate = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59);
    } else {
      startDate = startOfThisMonth;
      endDate = new Date();
      prevStartDate = startOfLastMonth;
      prevEndDate = endOfLastMonth;
    }

    // Query Completed Bookings for Selected Period
    const activeBookings = await bookingRepository.model.find({
      $or: [{ partner: partnerId }, { partner: String(partnerId) }],
      status: { $in: ['Completed', 'completed'] },
      updatedAt: { $gte: startDate, $lte: endDate },
    }).populate('service category');

    // Query Completed Bookings for Previous Period (for % growth calculation)
    const prevBookings = await bookingRepository.model.find({
      $or: [{ partner: partnerId }, { partner: String(partnerId) }],
      status: { $in: ['Completed', 'completed'] },
      updatedAt: { $gte: prevStartDate, $lte: prevEndDate },
    });

    // Also fetch ALL completed bookings if active period has 0
    const allCompletedBookings = await bookingRepository.model.find({
      $or: [{ partner: partnerId }, { partner: String(partnerId) }],
      status: { $in: ['Completed', 'completed'] },
    }).populate('service category');

    // Real Jobs Count
    const jobsCompleted = activeBookings.length > 0 ? activeBookings.length : allCompletedBookings.length;
    const prevJobsCompleted = prevBookings.length;

    // Real Revenue
    const totalRevenue = activeBookings.reduce((sum, b) => {
      const net = b.financialSnapshot?.partnerNetEarning ?? (b.amount ? Math.round(b.amount * 0.90) : 359);
      return sum + net;
    }, 0) || allCompletedBookings.reduce((sum, b) => {
      const net = b.financialSnapshot?.partnerNetEarning ?? (b.amount ? Math.round(b.amount * 0.90) : 359);
      return sum + net;
    }, 0);

    const prevRevenue = prevBookings.reduce((sum, b) => {
      const net = b.financialSnapshot?.partnerNetEarning ?? (b.amount ? Math.round(b.amount * 0.90) : 359);
      return sum + net;
    }, 0);

    // Growth Text Calculations
    let jobsGrowthText = '0% vs last month';
    if (prevJobsCompleted > 0) {
      const diff = Math.round(((jobsCompleted - prevJobsCompleted) / prevJobsCompleted) * 100);
      jobsGrowthText = `${diff >= 0 ? '+' : ''}${diff}% vs last month`;
    } else if (jobsCompleted > 0) {
      jobsGrowthText = '+100% vs last month';
    }

    let revenueGrowthText = '0% vs last month';
    if (prevRevenue > 0) {
      const diff = Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 100);
      revenueGrowthText = `${diff >= 0 ? '+' : ''}${diff}% vs last month`;
    } else if (totalRevenue > 0) {
      revenueGrowthText = '+100% vs last month';
    }

    // Category Performance Breakdown
    const catMap = {};
    const bookingsToGroup = activeBookings.length > 0 ? activeBookings : allCompletedBookings;

    bookingsToGroup.forEach((b) => {
      const catName = b.service?.name || b.category?.name || b.serviceName || b.categoryName || 'General Service';
      const net = b.financialSnapshot?.partnerNetEarning ?? (b.amount ? Math.round(b.amount * 0.90) : 359);
      if (!catMap[catName]) {
        catMap[catName] = { name: catName, jobs: 0, revenue: 0 };
      }
      catMap[catName].jobs += 1;
      catMap[catName].revenue += net;
    });

    const categoryPerformance = Object.values(catMap);

    return {
      period,
      jobsCompleted,
      jobsGrowthText,
      totalRevenue,
      prevRevenue,
      revenueGrowthText,
      avgRating: p?.rating || 5.0,
      ratingText: 'Stable',
      onTimeArrivalRate: '100%',
      onTimeArrivalText: '0% vs last month',
      categoryPerformance,
    };
  }
}

export const partnerDashboardService = new PartnerDashboardService();
