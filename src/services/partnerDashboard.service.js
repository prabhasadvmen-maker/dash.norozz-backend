import crypto from 'crypto';
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
import { dispatchNewJobOffer, notifyBookingUpdate, emitToUser } from '../sockets/index.js';
import { isPartnerEligibleForBooking, resolvePartnerCities } from '../utils/partnerEligibility.js';
import { financialEngineService } from './financialEngine.service.js';
import { User } from '../models/user.model.js';
import { SystemSettings } from '../models/systemSettings.model.js';
import { PlatformAccount } from '../models/platformAccount.model.js';

const netOf = (b) => Number(b?.financialSnapshot?.partnerNetEarning ?? 0);

// A partner may only see customer contact details for jobs that are actually assigned to them
const forPartner = (booking, partnerId) => {
  const obj = typeof booking.toObject === 'function' ? booking.toObject() : { ...booking };
  if (String(obj.partner?._id || obj.partner || '') !== String(partnerId)) {
    if (obj.customer && typeof obj.customer === 'object') obj.customer = { _id: obj.customer._id, name: obj.customer.name };
  }
  return obj;
};

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
    const emptyMetrics = {
      todaysJobs: 0,
      pendingJobs: 0,
      completedJobs: 0,
      walletBalance: 0,
      monthlyEarnings: 0,
      rating: '0.0',
      activeWorkers: 0,
    };

    if (!isActive) {
      return {
        noticeMessage: 'Your account is disabled/suspended due to policy limits or cancellations. Contact City Admin to re-enable.',
        kycStatus: partner.kycStatus,
        status: partner.status,
        isBookingUnlocked: false,
        metrics: { ...emptyMetrics, walletBalance: partner.walletBalance || 0 },
        recentBookings: [],
      };
    }

    if (!isApproved) {
      return {
        noticeMessage: 'Your account is under verification.',
        kycStatus: partner.kycStatus,
        isBookingUnlocked: false,
        metrics: emptyMetrics,
        recentBookings: [],
      };
    }

    const populate = (q) =>
      q
        .populate('category', 'name slug image')
        .populate('service', 'name slug price finalPrice duration')
        .populate('customer', 'name email phone');

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);

    const [recentBookings, activeCount, completedBookings, openOffers, fresh] = await Promise.all([
      populate(bookingRepository.model.find({ partner: partner._id }).sort({ createdAt: -1 }).limit(10)),
      bookingRepository.model.countDocuments({ partner: partner._id, status: { $in: ['Assigned', 'Accepted', 'On The Way', 'Started'] } }),
      bookingRepository.model.find({ partner: partner._id, status: 'Completed' }).select('financialSnapshot completedAt createdAt'),
      this.getPendingBookings(partner),
      User.findById(partner._id).select('walletBalance lifetimeEarnings averageRating totalRatings'),
    ]);

    const when = (b) => new Date(b.completedAt || b.createdAt);
    const todayEarnings = completedBookings.filter((b) => when(b) >= startOfToday).reduce((sum, b) => sum + netOf(b), 0);
    const monthlyEarnings = completedBookings.filter((b) => when(b) >= startOfMonth).reduce((sum, b) => sum + netOf(b), 0);

    return {
      noticeMessage: 'Account Active & Operational',
      kycStatus: 'approved',
      isBookingUnlocked: true,
      metrics: {
        todayEarnings,
        todayBookingsCount: activeCount,
        todaysJobs: activeCount,
        pendingJobs: openOffers.length,
        completedJobs: completedBookings.length,
        walletBalance: fresh?.walletBalance || 0,
        monthlyEarnings,
        lifetimeEarnings: fresh?.lifetimeEarnings || 0,
        rating: fresh?.totalRatings > 0 ? Number(fresh.averageRating).toFixed(1) : '0.0',
        activeWorkers: 1,
      },
      recentBookings,
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

    const partnerDoc = await User.findById(partner._id).lean();
    await resolvePartnerCities(partnerDoc);

    // Only PAID, unclaimed, open offers this partner has not already turned down
    const openBookings = await bookingRepository.model
      .find({
        partner: null,
        status: 'Pending',
        paymentStatus: 'paid',
        financialStatus: 'AMOUNT_HELD',
        cancelledByPartners: { $ne: partner._id },
      })
      .populate('category', 'name slug image')
      .populate('service', 'name slug price finalPrice duration')
      .populate('customer', 'name')
      .sort({ createdAt: -1 })
      .limit(100);

    return openBookings.filter((b) => isPartnerEligibleForBooking(partnerDoc, b));
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
    const list = await bookingRepository.model
      .find({
        $or: [
          { partner: partner._id, status: { $in: ['Cancelled', 'Refunded'] } },
          { cancelledByPartners: partner._id },
        ],
      })
      .populate('category', 'name slug image')
      .populate('service', 'name slug price finalPrice duration')
      .populate('customer', 'name email phone')
      .sort({ createdAt: -1 });
    return list.map((b) => forPartner(b, partner._id));
  }

  async getAllBookings(partner) {
    this.checkKycApproved(partner);

    // Return this partner's own claimed / assigned bookings AND bookings cancelled by this partner
    const list = await bookingRepository.model
      .find({
        $or: [
          { partner: partner._id },
          { cancelledByPartners: partner._id },
        ],
      })
      .populate('category', 'name slug image')
      .populate('service', 'name slug price finalPrice duration')
      .populate('customer', 'name email phone rating createdAt')
      .sort({ createdAt: -1 });
    return list.map((b) => forPartner(b, partner._id));
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
          { partner: null, status: 'Pending', paymentStatus: 'paid', cancelledByPartners: { $ne: partner._id } },
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

    const bookingObj = booking.toObject();

    // Open (unclaimed) offers: no customer contact details until the partner accepts the job
    if (!booking.partner || String(booking.partner._id || booking.partner) !== String(partner._id)) {
      bookingObj.customer = { _id: booking.customer?._id, name: booking.customer?.name };
      bookingObj.customerHistory = [];
      return bookingObj;
    }

    // Assigned partner: customer last 3 service history items
    bookingObj.customerHistory = await bookingRepository.model
      .find({ customer: booking.customer._id })
      .sort({ createdAt: -1 })
      .limit(3)
      .select('bookingId packageName amount status createdAt');

    return bookingObj;
  }

  // 3. WALLET & EARNINGS
  async getWallet(partner) {
    const p = await userRepository.findById(partner._id);
    const transactions = await WalletTransaction.find({ partnerId: partner._id }).sort({ createdAt: -1 }).limit(200);

    return {
      partnerId: partner._id,
      walletBalance: p?.walletBalance ?? 0,
      securityDeposit: p?.securityDeposit ?? 0,
      pendingClearance: p?.withdrawalPending ?? 0,
      withdrawalPending: p?.withdrawalPending ?? 0,
      totalEarned: p?.lifetimeEarnings ?? 0,
      bankDetails: p?.bankDetails || {},
      transactions,
    };
  }

  async getEarnings(partner) {
    const p = await userRepository.findById(partner._id);

    const completedBookings = await bookingRepository.model
      .find({ partner: partner._id, status: 'Completed' })
      .populate('customer', 'name')
      .sort({ completedAt: -1 });

    const dateOf = (b) => new Date(b.completedAt || b.updatedAt || b.createdAt);
    const net = netOf;
    const sum = (list) => list.reduce((t, b) => t + net(b), 0);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
    const startOfWeek = new Date(startOfToday.getTime() - ((startOfToday.getDay() + 6) % 7) * 86400000); // Monday
    const startOfLastWeek = new Date(startOfWeek.getTime() - 7 * 86400000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const inRange = (b, from, to) => {
      const d = dateOf(b);
      return d >= from && (!to || d < to);
    };
    const pct = (cur, prev) => (prev > 0 ? `${cur >= prev ? '+' : ''}${Math.round(((cur - prev) / prev) * 100)}%` : cur > 0 ? '+100%' : '0%');

    const today = completedBookings.filter((b) => inRange(b, startOfToday));
    const yesterday = completedBookings.filter((b) => inRange(b, startOfYesterday, startOfToday));
    const week = completedBookings.filter((b) => inRange(b, startOfWeek));
    const lastWeek = completedBookings.filter((b) => inRange(b, startOfLastWeek, startOfWeek));
    const month = completedBookings.filter((b) => inRange(b, startOfMonth));
    const lastMonth = completedBookings.filter((b) => inRange(b, startOfLastMonth, startOfMonth));

    const totalEarned = sum(completedBookings);
    const totalJobs = completedBookings.length;

    // Monthly trend: last 7 calendar months
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      trend.push({ month: monthNames[from.getMonth()], val: sum(completedBookings.filter((b) => inRange(b, from, to))) });
    }
    const maxTrend = Math.max(...trend.map((t) => t.val), 0);
    const monthlyTrend = trend.map((t) => ({ ...t, height: maxTrend > 0 ? `${Math.round((t.val / maxTrend) * 100)}%` : '0%' }));

    // Hourly activity today
    const hourSlots = [[9, '9 AM'], [11, '11 AM'], [13, '1 PM'], [15, '3 PM'], [17, '5 PM'], [19, '7 PM']];
    const hourlyActivity = hourSlots.map(([h, label], i) => {
      const next = hourSlots[i + 1] ? hourSlots[i + 1][0] : 24;
      const lower = i === 0 ? 0 : h;
      return { hour: label, val: sum(today.filter((b) => dateOf(b).getHours() >= lower && dateOf(b).getHours() < next)) };
    });

    // Day-of-week breakdown this week (Mon..Sun)
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dailyBreakdown = dayLabels.map((day, i) => {
      const from = new Date(startOfWeek.getTime() + i * 86400000);
      const to = new Date(from.getTime() + 86400000);
      return { day, val: sum(week.filter((b) => inRange(b, from, to))) };
    });
    const busiest = [...dailyBreakdown].sort((a, b) => b.val - a.val)[0];

    // Week-of-month breakdown
    const weeklyBreakdown = [1, 2, 3, 4].map((w) => {
      const from = new Date(now.getFullYear(), now.getMonth(), (w - 1) * 7 + 1);
      const to = w === 4 ? new Date(now.getFullYear(), now.getMonth() + 1, 1) : new Date(now.getFullYear(), now.getMonth(), w * 7 + 1);
      return { week: `W${w}`, val: sum(month.filter((b) => inRange(b, from, to))) };
    });

    const todayFormattedJobs = today.map((b) => ({
      id: b.bookingId || `JOB-${b._id.toString().slice(-4)}`,
      serviceName: b.packageName || 'Service Job',
      customerName: b.customer?.name || 'Customer',
      time: dateOf(b).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      amount: net(b),
    }));

    const monthEarned = sum(month);
    return {
      partnerId: partner._id,
      overview: {
        totalEarned,
        totalJobs,
        avgPerJob: totalJobs > 0 ? Math.round(totalEarned / totalJobs) : 0,
        monthlyTrend,
      },
      daily: {
        dateLabel: 'Today',
        totalEarnedToday: sum(today),
        percentageChange: pct(sum(today), sum(yesterday)),
        hourlyActivity,
        completedJobs: todayFormattedJobs,
      },
      weekly: {
        weekLabel: 'Current Week',
        totalEarnedWeek: sum(week),
        percentageChange: pct(sum(week), sum(lastWeek)),
        dailyBreakdown,
        busiestDay: busiest && busiest.val > 0 ? busiest.day : 'None',
        busiestDayDetails: week.length > 0 ? `You completed ${week.length} service job(s) this week` : 'No completed jobs this week yet',
      },
      monthly: {
        monthLabel: 'Current Month',
        totalEarnedMonth: monthEarned,
        percentageChange: pct(monthEarned, sum(lastMonth)),
        weeklyBreakdown,
        avgWeeklyEarned: Math.round(monthEarned / 4),
        activeDays: new Set(month.map((b) => dateOf(b).toDateString())).size,
        payoutDestination: `${p?.bankDetails?.bankName || 'Bank Account'} ${p?.bankDetails?.accountNumber ? `•••• ${p.bankDetails.accountNumber.slice(-4)}` : ''}`,
      },
    };
  }

  async requestWithdrawal(partnerId, amount) {
    return financialEngineService.processPartnerWithdrawal(partnerId, amount);
  }

  async addDepositToWallet() {
    throw new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      'Wallet top-up must be completed through the payment gateway. Please use the "Add Money" payment option.'
    );
  }

  // 4. RATING & REVIEWS
  async getRating(partner) {
    const p = await userRepository.findById(partner._id);
    const breakdown = p?.ratingBreakdown || {};
    const count = (star) => Number(breakdown?.[star] ?? breakdown?.get?.(String(star)) ?? 0);
    return {
      averageRating: p?.averageRating ?? 0,
      totalRatings: p?.totalRatings ?? 0,
      fiveStar: count(5),
      fourStar: count(4),
      threeStar: count(3),
      twoStar: count(2),
      oneStar: count(1),
    };
  }

  async getReviews(partner) {
    const { Review } = await import('../models/review.model.js');
    const reviews = await Review.find({
      revieweeId: partner._id,
      status: 'PUBLISHED',
      isDeleted: false,
    })
      .populate('reviewerId', 'name profileImage')
      .populate('orderId', 'bookingNumber packageName serviceName')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return reviews.map((r) => ({
      id: r._id,
      customer: r.reviewerId?.name || 'Customer',
      customerImage: r.reviewerId?.profileImage || '',
      rating: r.rating,
      comment: r.comment || '',
      service: r.orderId?.packageName || r.orderId?.serviceName || '',
      bookingNumber: r.orderId?.bookingNumber || '',
      date: r.createdAt,
    }));
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
    // Mass-assignment guard: only these profile fields may ever be changed by the partner themselves.
    // (role, status, kycStatus, wallet/ledger balances, ratings, approval flags ... are NEVER client-writable)
    const ALLOWED = [
      'name', 'agencyName', 'profileImage', 'address', 'city', 'state', 'dob', 'gender', 'experience',
      'certifications', 'workRadius', 'localities', 'locationCoordinates', 'preferredLanguage',
      'category', 'categories', 'offeredServices', 'isLocationSaved', 'isCategorySelected', 'isSkillsUpdated', 'isServiceAreaSet',
    ];
    const cleanData = {};
    for (const key of ALLOWED) {
      if (updateData[key] !== undefined) cleanData[key] = updateData[key];
    }
    if (cleanData.workRadius !== undefined) {
      const wr = Number(cleanData.workRadius);
      if (!Number.isFinite(wr) || wr < 1 || wr > 100) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Work radius must be between 1 and 100 km');
      }
      cleanData.workRadius = wr;
    }

    // Bank details: the partner can never mark their own bank account as verified
    if (updateData.bankDetails && typeof updateData.bankDetails === 'object') {
      const b = updateData.bankDetails;
      for (const k of ['accountHolderName', 'bankName', 'accountNumber', 'ifscCode', 'upiId']) {
        if (b[k] !== undefined) cleanData[`bankDetails.${k}`] = String(b[k]).trim().slice(0, 100);
      }
      cleanData['bankDetails.isVerified'] = false;
    }

    // Documents: only document file fields; review statuses stay admin-controlled. A re-upload goes back to 'pending'.
    if (updateData.documents && typeof updateData.documents === 'object') {
      const DOC_KEYS = ['aadhaarDoc', 'aadhaarFront', 'aadhaarBack', 'panDoc', 'drivingLicenseDoc', 'passportPhoto', 'bankPassbookDoc', 'gstDoc'];
      const STATUS_KEYS = ['aadhaarFront', 'aadhaarBack', 'panDoc', 'drivingLicenseDoc', 'bankPassbookDoc', 'passportPhoto'];
      for (const k of DOC_KEYS) {
        let v = updateData.documents[k];
        if (typeof v !== 'string' || !v) continue;
        if (v.startsWith('data:image') || v.startsWith('data:application/pdf')) {
          const uploaded = await r2StorageService.uploadBase64Image(v, 'norozz_partner_documents');
          // the storage helper returns the original base64 string when the upload failed
          if (!uploaded || String(uploaded).startsWith('data:')) {
            throw new ApiError(HTTP_STATUS.BAD_REQUEST, `Could not upload ${k}. Please try again.`);
          }
          v = uploaded;
        }
        cleanData[`documents.${k}`] = v;
        if (STATUS_KEYS.includes(k)) cleanData[`documents.statuses.${k}`] = 'pending';
      }
    }

    // Upload a base64 profile image to storage and save the public URL. Never persist raw base64 in the DB.
    if (typeof cleanData.profileImage === 'string' && cleanData.profileImage.startsWith('data:image')) {
      const uploaded = await r2StorageService.uploadBase64Image(cleanData.profileImage, 'norozz_partner_profiles');
      if (!uploaded || String(uploaded).startsWith('data:')) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Could not upload profile image. Please try again.');
      }
      cleanData.profileImage = uploaded;
    }

    const updated = await userRepository.updateById(partnerId, { $set: cleanData });
    if (!updated) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Partner profile not found');
    const obj = updated.toObject();
    delete obj.password;
    return obj;
  }

  async getAvailability(partner) {
    const p = await userRepository.findById(partner._id);
    const workingHours = Array.isArray(p?.workingHours) ? p.workingHours : [];
    return {
      partnerId: partner._id,
      isOnline: p?.isOnline ?? true,
      workingHours,
      workingDays: workingHours.filter((d) => d.isOpen).map((d) => d.day),
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
    if (Array.isArray(workingHours)) {
      updateData.workingHours = workingHours
        .filter((d) => d && d.day)
        .map((d) => ({
          day: String(d.day),
          isOpen: d.isOpen !== false,
          openTime: d.openTime || '09:00 AM',
          closeTime: d.closeTime || '07:00 PM',
        }));
      updateData.isWorkingHoursSet = true;
    }

    const updatedUser = await userRepository.updateById(partnerId, updateData);
    return {
      message: `Technician status updated to ${updatedUser?.isOnline ? 'ONLINE' : 'OFFLINE'}`,
      isOnline: updatedUser?.isOnline ?? isOnline,
      workingHours: updatedUser?.workingHours || [],
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
    const p = await userRepository.findById(partner._id);
    const items = [];

    const kycMessages = {
      approved: ['KYC Approved', 'Your KYC is approved. You can now receive bookings.'],
      rejected: ['KYC Rejected', 'Your KYC was rejected. Please re-upload your documents.'],
      pending: ['KYC Under Review', 'Your documents are under review by City Admin.'],
    };
    const [kycTitle, kycMessage] = kycMessages[p?.kycStatus] || kycMessages.pending;
    items.push({ id: 'kyc-status', type: 'kyc', title: kycTitle, message: kycMessage, createdAt: p?.updatedAt || p?.createdAt });

    const bookings = await bookingRepository.model
      .find({ $or: [{ partner: partner._id }, { partner: String(partner._id) }] })
      .select('bookingNumber status packageName serviceName updatedAt')
      .sort({ updatedAt: -1 })
      .limit(15)
      .lean();
    for (const b of bookings) {
      items.push({
        id: `booking-${b._id}`,
        type: 'booking',
        title: `Booking ${b.bookingNumber || ''} ${b.status}`.trim(),
        message: b.packageName || b.serviceName || 'Service booking update',
        createdAt: b.updatedAt,
      });
    }

    const txns = await WalletTransaction.find({ partnerId: partner._id }).sort({ createdAt: -1 }).limit(10).lean();
    for (const t of txns) {
      items.push({
        id: `txn-${t._id}`,
        type: 'wallet',
        title: `${t.type === 'Credit' ? 'Credited' : 'Debited'} ₹${t.amount}`,
        message: t.title,
        createdAt: t.createdAt,
      });
    }

    return items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 30);
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

    // Plain value: the User pre-save hook hashes it (hashing here would double-hash)
    user.password = newPassword;
    await user.save();

    return { message: 'Password updated successfully' };
  }

  // 9. COMPLAINTS & TICKETS
  async submitComplaint(partnerId, { complaintType, bookingId, description, priority, screenshot }) {
    const { User } = await import('../models/user.model.js');
    const { Ticket } = await import('../models/ticket.model.js');

    const partner = await User.findById(partnerId).lean();
    await resolvePartnerCities(partner);
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
                serviceName: srv.name,
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
              serviceName: srv.name,
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

    // 3. A partner with no restriction configured may add any active service of the booking's category.
    //    A partner whose configured services are all inactive/deleted gets none (the add endpoint would refuse them).
    const hasConfiguredServices = Array.isArray(partner?.offeredServices) && partner.offeredServices.length > 0;
    if (offeredList.length === 0 && !hasConfiguredServices) {
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
              serviceName: srv.name,
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
            serviceName: srv.name,
            title: 'Standard',
            desc: srv.description || 'Professional extra service add-on',
            price: srv.finalPrice || srv.price || 399,
            finalPrice: srv.finalPrice || srv.price || 399,
            category: 'Catalog Offered Service'
          });
        }
      }
    }

    return offeredList;
  }

  // 13. PARTNER CANCEL ACCEPTED BOOKING & AUTO RE-DISPATCH VIA SOCKET.IO
  async cancelAcceptedBooking(partner, bookingId, { reason, note } = {}) {
    this.checkKycApproved(partner);
    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Booking request not found');
    }

    const booking = await bookingRepository.model.findById(bookingId);
    if (!booking) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Booking request not found');
    }
    if (String(booking.partner) !== String(partner._id)) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'You cannot cancel a booking that is not assigned to you.');
    }
    if (booking.status === 'Started' || booking.otpVerified) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'The service has already started. It can no longer be cancelled.');
    }
    if (!['Assigned', 'Accepted', 'On The Way'].includes(booking.status)) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'This booking has already been completed or cancelled.');
    }

    const cleanReason = String(reason || '').slice(0, 200);
    const cleanNote = String(note || '').slice(0, 300);
    const cancelReasonStr = cleanReason ? `${cleanReason}${cleanNote ? ` - ${cleanNote}` : ''}` : (cleanNote || 'Partner cancelled accepted booking request');

    // Atomically release the job back to the open pool (with a fresh OTP for the next partner)
    const reopened = await bookingRepository.model.findOneAndUpdate(
      { _id: bookingId, partner: partner._id, status: { $in: ['Assigned', 'Accepted', 'On The Way'] }, otpVerified: { $ne: true } },
      {
        $set: {
          partner: null,
          status: 'Pending',
          assignedAt: null,
          autoAssignAttemptedAt: null,
          otpVerified: false,
          otpFailedAttempts: 0,
          startedAt: null,
          completionOtp: String(crypto.randomInt(1000, 10000)),
          cancellationReason: cancelReasonStr,
          cancelledBy: 'partner',
        },
        $addToSet: { cancelledByPartners: partner._id },
        $inc: { reassignCount: 1 },
      },
      { new: true }
    );
    if (!reopened) {
      throw new ApiError(HTTP_STATUS.CONFLICT, 'Booking state changed. Please refresh.');
    }

    // Daily cancellation limit & penalty
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

    if (penaltyAmount > 0) {
      const out = await financialEngineService.applyOnce(
        {
          orderId: reopened._id,
          userId: partner._id,
          accountType: 'PARTNER_WALLET',
          type: 'CANCELLATION_CHARGE',
          direction: 'DEBIT',
          amount: penaltyAmount,
          referenceType: 'Booking',
          referenceId: reopened.bookingId,
          idempotencyKey: `PENALTY-${reopened.bookingId}-${partner._id}-${reopened.reassignCount}`,
          metadata: { reason: cancelReasonStr },
        },
        async () => {
          const u = await User.findByIdAndUpdate(
            partner._id,
            { $inc: { walletBalance: -penaltyAmount, availableBalance: -penaltyAmount, withdrawableBalance: -penaltyAmount } },
            { new: true }
          );
          await PlatformAccount.findOneAndUpdate(
            { accountName: 'Norozz Main Revenue Account' },
            { $inc: { grossRevenue: penaltyAmount, netPlatformRevenue: penaltyAmount } },
            { upsert: true }
          );
          return { balanceBefore: (u?.walletBalance || 0) + penaltyAmount, balanceAfter: u?.walletBalance || 0 };
        }
      );
      if (out.applied) {
        isPenaltyApplied = true;
        await WalletTransaction.create({
          transactionId: `PEN-${Date.now()}-${crypto.randomInt(1000, 10000)}`,
          partnerId: partner._id,
          type: 'Debit',
          category: 'Cancellation Penalty',
          title: `Cancellation Penalty Fee (#${todayCancellationsCount} cancellation today)`,
          amount: penaltyAmount,
          status: 'Completed',
        }).catch((e) => console.error('Penalty txn log error:', e.message));
      }
    }

    if (todayCancellationsCount > maxDailyAllowed) {
      await User.updateOne({ _id: partner._id }, { $set: { status: 'suspended', isOnline: false } });
      isSuspended = true;
    }

    let responseMsg = `Booking cancelled. ₹${penaltyAmount} penalty fee deducted from your wallet.`;
    if (isSuspended) {
      responseMsg = `⚠️ Daily cancellation limit exceeded (${todayCancellationsCount} cancellations today)! ₹${penaltyAmount} penalty fee debited, and your account has been temporarily suspended. Please contact Admin.`;
    }

    // Re-dispatch to other eligible partners & tell the customer
    const populatedBooking = await bookingRepository.model
      .findById(reopened._id)
      .populate('category', 'name slug image')
      .populate('service', 'name slug price finalPrice duration')
      .populate('customer', 'name email phone');

    dispatchNewJobOffer(populatedBooking).catch((err) => console.error('Socket re-dispatch error on partner cancellation:', err));
    emitToUser(populatedBooking.customer?._id, 'partner_unassigned', {
      bookingId: reopened._id,
      bookingNumber: reopened.bookingId,
      message: 'Assigned technician had an emergency. Searching for another verified technician in your area...',
      status: 'Pending',
    });
    notifyBookingUpdate(reopened);

    return {
      message: responseMsg,
      bookingId: reopened._id,
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


    // Real Jobs Count
    const jobsCompleted = activeBookings.length;
    const prevJobsCompleted = prevBookings.length;

    // Real Revenue
    const totalRevenue = activeBookings.reduce((sum, b) => sum + netOf(b), 0);

    const prevRevenue = prevBookings.reduce((sum, b) => {
      const net = netOf(b);
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
    const bookingsToGroup = activeBookings;

    bookingsToGroup.forEach((b) => {
      const catName = b.service?.name || b.category?.name || b.serviceName || b.categoryName || 'General Service';
      const net = netOf(b);
      if (!catMap[catName]) {
        catMap[catName] = { name: catName, jobs: 0, revenue: 0 };
      }
      catMap[catName].jobs += 1;
      catMap[catName].revenue += net;
    });

    const categoryPerformance = Object.values(catMap).sort((a, b) => b.revenue - a.revenue);

    // Numeric growth (null when the previous period has no data to compare against)
    const growthPct = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);

    return {
      period,
      periodLabel: startDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
      prevPeriodLabel: prevStartDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
      jobsCompleted,
      prevJobsCompleted,
      jobsGrowthPct: growthPct(jobsCompleted, prevJobsCompleted),
      jobsGrowthText,
      totalRevenue,
      prevRevenue,
      revenueGrowthPct: growthPct(totalRevenue, prevRevenue),
      revenueGrowthText,
      avgRating: p?.totalRatings > 0 ? p.averageRating : 0,
      totalRatings: p?.totalRatings || 0,
      ratingText: 'Stable',
      onTimeArrivalRate: 'N/A',
      onTimeArrivalText: 'Not tracked yet',
      categoryPerformance,
    };
  }
}

export const partnerDashboardService = new PartnerDashboardService();
