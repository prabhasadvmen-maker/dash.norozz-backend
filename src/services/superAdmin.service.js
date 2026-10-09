import { User } from '../models/user.model.js';
import { City } from '../models/city.model.js';
import { Category } from '../models/category.model.js';
import { userRepository } from '../repositories/user.repository.js';
import { bookingRepository } from '../repositories/booking.repository.js';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { ROLES } from '../constants/roles.constant.js';

export class SuperAdminService {

  // Helper to build city & category map and populate city & category names
  async populateCityNames(userList) {
    if (!Array.isArray(userList) || userList.length === 0) return userList;
    const cities = await City.find({}).lean();
    const categories = await Category.find({}).lean();

    const citiesMap = {};
    cities.forEach((c) => {
      citiesMap[String(c._id)] = c.name;
    });

    const catMap = {};
    categories.forEach((c) => {
      catMap[String(c._id)] = c.name;
    });

    return userList.map((u) => {
      const userObj = typeof u.toObject === 'function' ? u.toObject() : { ...u };
      delete userObj.password;
      delete userObj.refreshToken;

      let rawCity = userObj.assignedCity || userObj.city || '';
      if (typeof rawCity === 'object' && rawCity?.name) rawCity = rawCity.name;
      if (typeof rawCity === 'string' && citiesMap[rawCity]) {
        rawCity = citiesMap[rawCity];
      }
      userObj.assignedCity = rawCity || 'Delhi NCR';
      userObj.city = rawCity || 'Delhi NCR';

      let catDisplay = '';
      if (userObj.category) {
        if (typeof userObj.category === 'object' && userObj.category !== null) {
          catDisplay = userObj.category.name || catMap[String(userObj.category._id || userObj.category)] || '';
        } else {
          const strCat = String(userObj.category);
          if (catMap[strCat]) {
            catDisplay = catMap[strCat];
          } else if (!strCat.match(/^[0-9a-fA-F]{24}$/)) {
            catDisplay = strCat;
          }
        }
      } else if (Array.isArray(userObj.categories) && userObj.categories.length > 0) {
        const names = userObj.categories
          .map((c) => (typeof c === 'object' && c?.name ? c.name : catMap[String(c._id || c)] || null))
          .filter(Boolean);
        if (names.length > 0) catDisplay = names.join(', ');
      }
      if (catDisplay) {
        userObj.category = catDisplay;
      }

      return userObj;
    });
  }

  // 1. DASHBOARD ANALYTICS & STATS
  async getDashboardStats() {
    const totalCustomers = await userRepository.count({ role: ROLES.CUSTOMER });
    const totalPartners = await userRepository.count({ role: ROLES.PARTNER });
    const totalCityAdmins = await userRepository.count({ role: { $in: [ROLES.CITY_ADMIN, ROLES.ADMIN] } });
    const totalCities = await City.countDocuments();
    const totalBookings = await bookingRepository.count();
    const grossRevenue = await bookingRepository.getGrossRevenue();

    // Live Booking Status Breakdown
    const completedBookingsCount = await bookingRepository.count({ status: { $in: ['completed', 'Completed', 'confirmed', 'Confirmed'] } });
    const pendingBookingsCount = await bookingRepository.count({ status: { $in: ['pending', 'Pending', 'accepted', 'Accepted', 'In Progress', 'in_progress'] } });
    const cancelledBookingsCount = await bookingRepository.count({ status: { $in: ['cancelled', 'Cancelled', 'refunded', 'Refunded'] } });

    // Financial Ledger Metrics Calculation
    const grossBookingValue = Number(grossRevenue || 0);
    const customerPlatformFees = Math.round(grossBookingValue * 0.05); // 5% Customer Platform Fee
    const partnerCommissions = Math.round(grossBookingValue * 0.20);   // 20% Partner Commission
    const grossPlatformRevenue = customerPlatformFees + partnerCommissions;
    const refundsAdjustments = Math.round(grossBookingValue * 0.01);
    const gatewayCharges = Math.round(grossBookingValue * 0.02);
    const netPlatformRevenue = Math.max(0, grossPlatformRevenue - refundsAdjustments - gatewayCharges);

    const recentBookings = await bookingRepository.findRecent(5);
    const recentPartners = await userRepository.find({ role: ROLES.PARTNER }, '-password', { createdAt: -1 });
    const recentCustomers = await userRepository.find({ role: ROLES.CUSTOMER }, '-password', { createdAt: -1 });

    const populatedPartners = await this.populateCityNames(recentPartners);
    const populatedCustomers = await this.populateCityNames(recentCustomers);

    return {
      overview: {
        grossRevenue: grossBookingValue,
        platformCommission: partnerCommissions,
        totalCustomers: totalCustomers || 0,
        totalPartners: totalPartners || 0,
        totalCityAdmins: totalCityAdmins || 0,
        totalCities: totalCities || 0,
        totalBookings: totalBookings || 0,
        completedBookings: completedBookingsCount || 0,
        pendingBookings: pendingBookingsCount || 0,
        cancelledBookings: cancelledBookingsCount || 0,
      },
      financialLedger: {
        grossBookingValue,
        customerPlatformFees,
        partnerCommissions,
        grossPlatformRevenue,
        refundsAdjustments,
        gatewayCharges,
        netPlatformRevenue,
      },
      recentBookings,
      recentPartners: populatedPartners.slice(0, 5),
      recentCustomers: populatedCustomers.slice(0, 5),
    };
  }

  // 2. CITY ADMIN MANAGEMENT
  async getAllCityAdmins() {
    const admins = await User.find({ role: { $in: [ROLES.CITY_ADMIN, ROLES.ADMIN] } }).select('-password').sort({ createdAt: -1 }).lean();
    return await this.populateCityNames(admins);
  }

  async createCityAdmin(adminData, createdById) {
    const existing = await userRepository.findByEmail(adminData.email);
    if (existing) {
      throw new ApiError(HTTP_STATUS.CONFLICT, 'An account with this email already exists');
    }

    const cityAdmin = await userRepository.create({
      ...adminData,
      role: ROLES.CITY_ADMIN,
      status: 'active',
      isEmailVerified: true,
      isPhoneVerified: true,
      createdBy: createdById,
    });

    const adminObj = cityAdmin.toObject();
    delete adminObj.password;
    return adminObj;
  }

  async updateCityAdmin(adminId, updateData, updatedById) {
    const admin = await userRepository.findById(adminId);
    if (!admin || (admin.role !== ROLES.CITY_ADMIN && admin.role !== ROLES.ADMIN)) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'City Admin not found');
    }

    const updatedAdmin = await userRepository.updateById(adminId, {
      ...updateData,
      updatedBy: updatedById,
    });

    return updatedAdmin;
  }

  async deleteCityAdmin(adminId) {
    const admin = await userRepository.findById(adminId);
    if (!admin || (admin.role !== ROLES.CITY_ADMIN && admin.role !== ROLES.ADMIN)) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'City Admin not found');
    }

    await userRepository.deleteById(adminId);
    return { message: `City Admin '${admin.name}' deleted successfully` };
  }

  async suspendCityAdmin(adminId, status) {
    const admin = await userRepository.findById(adminId);
    if (!admin || (admin.role !== ROLES.CITY_ADMIN && admin.role !== ROLES.ADMIN)) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'City Admin not found');
    }

    admin.status = status === 'active' ? 'active' : 'blocked';
    await admin.save();

    return { message: `City Admin status updated to '${admin.status.toUpperCase()}'`, admin };
  }

  async resetCityAdminPassword(adminId, newPassword) {
    const admin = await userRepository.findById(adminId);
    if (!admin || (admin.role !== ROLES.CITY_ADMIN && admin.role !== ROLES.ADMIN)) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'City Admin not found');
    }

    admin.password = newPassword;
    await admin.save();

    return { message: `Password for City Admin '${admin.name}' reset successfully` };
  }

  async impersonateCityAdmin(adminId) {
    const admin = await userRepository.findById(adminId);
    if (!admin || (admin.role !== ROLES.CITY_ADMIN && admin.role !== ROLES.ADMIN)) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'City Admin account not found');
    }

    if (admin.status === 'blocked' || admin.status === 'inactive') {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Cannot login to a disabled/blocked City Admin account');
    }

    const accessToken = admin.generateAccessToken();
    const obj = admin.toObject();
    delete obj.password;
    delete obj.refreshToken;

    const populatedList = await this.populateCityNames([obj]);
    const user = populatedList[0] || obj;

    return {
      message: `Successfully logged in as City Admin '${admin.name}'`,
      user,
      accessToken,
    };
  }

  // 3. MASTER DIRECTORIES
  async getAllCustomers() {
    const list = await userRepository.findByRole(ROLES.CUSTOMER);
    return await this.populateCityNames(list);
  }

  async getAllPartners() {
    const list = await userRepository.findByRole(ROLES.PARTNER);
    return await this.populateCityNames(list);
  }

  async getAllBookings() {
    const { Booking } = await import('../models/booking.model.js');
    return await Booking.find({})
      .populate('customer', 'name email phone')
      .populate('partner', 'name agencyName phone')
      .populate('service', 'name category')
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .lean();
  }

  // 5. COUPON MANAGEMENT SYSTEM (CRUD)
  async getAllCoupons() {
    const { Coupon } = await import('../models/coupon.model.js');
    return await Coupon.find({}).populate('applicableCategory', 'name icon slug').sort({ createdAt: -1 });
  }

  async createCoupon(data) {
    const { Coupon } = await import('../models/coupon.model.js');
    const existing = await Coupon.findOne({ code: data.code.toUpperCase() });
    if (existing) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, `Coupon code '${data.code.toUpperCase()}' already exists`);
    }

    const categoryVal = data.applicableCategory && String(data.applicableCategory).trim() !== '' ? data.applicableCategory : null;

    const coupon = await Coupon.create({
      code: data.code.toUpperCase(),
      title: data.title,
      description: data.description || '',
      applicableCategory: categoryVal,
      discountType: data.discountType || 'fixed',
      discountValue: Number(data.discountValue),
      maxDiscountAmount: data.maxDiscountAmount ? Number(data.maxDiscountAmount) : null,
      minBookingAmount: data.minBookingAmount ? Number(data.minBookingAmount) : 0,
      usageLimitPerUser: data.usageLimitPerUser ? Number(data.usageLimitPerUser) : 1,
      validUntil: data.validUntil ? new Date(data.validUntil) : null,
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    });

    const populatedCoupon = await Coupon.findById(coupon._id).populate('applicableCategory', 'name icon slug');

    return {
      message: 'Coupon created successfully!',
      coupon: populatedCoupon || coupon,
    };
  }

  async updateCoupon(id, data) {
    const { Coupon } = await import('../models/coupon.model.js');
    const coupon = await Coupon.findById(id);
    if (!coupon) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Coupon not found');
    }

    if (data.code && data.code.toUpperCase() !== coupon.code) {
      const existing = await Coupon.findOne({ code: data.code.toUpperCase() });
      if (existing) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, `Coupon code '${data.code.toUpperCase()}' already exists`);
      }
      coupon.code = data.code.toUpperCase();
    }

    if (data.title !== undefined) coupon.title = data.title;
    if (data.description !== undefined) coupon.description = data.description;
    if (data.applicableCategory !== undefined) {
      coupon.applicableCategory = data.applicableCategory && String(data.applicableCategory).trim() !== '' ? data.applicableCategory : null;
    }
    if (data.discountType !== undefined) coupon.discountType = data.discountType;
    if (data.discountValue !== undefined) coupon.discountValue = Number(data.discountValue);
    if (data.maxDiscountAmount !== undefined) coupon.maxDiscountAmount = data.maxDiscountAmount ? Number(data.maxDiscountAmount) : null;
    if (data.minBookingAmount !== undefined) coupon.minBookingAmount = Number(data.minBookingAmount);
    if (data.usageLimitPerUser !== undefined) coupon.usageLimitPerUser = Number(data.usageLimitPerUser);
    if (data.validUntil !== undefined) coupon.validUntil = data.validUntil ? new Date(data.validUntil) : null;
    if (data.isActive !== undefined) coupon.isActive = Boolean(data.isActive);

    await coupon.save();
    const updatedPopulated = await Coupon.findById(coupon._id).populate('applicableCategory', 'name icon slug');

    return {
      message: 'Coupon updated successfully!',
      coupon: updatedPopulated || coupon,
    };
  }

  async deleteCoupon(id) {
    const { Coupon } = await import('../models/coupon.model.js');
    const result = await Coupon.findByIdAndDelete(id);
    if (!result) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Coupon not found');
    }
    return { message: 'Coupon deleted successfully!' };
  }

  // 6. REFERRAL SETTINGS MANAGEMENT
  async getReferralSettings() {
    const { SystemSettings } = await import('../models/systemSettings.model.js');
    let settings = await SystemSettings.findOne({ key: 'global_settings' });
    if (!settings) {
      settings = await SystemSettings.create({
        key: 'global_settings',
        customerPlatformFeePercent: 5,
        partnerPlatformFeePercent: 10,
        referralBonusAmount: 500,
        partnerCancellationPenaltyAmount: 100,
        maxDailyFreeCancellations: 3,
        currency: 'INR',
      });
    } else {
      let updated = false;
      if (settings.customerPlatformFeePercent === undefined || settings.customerPlatformFeePercent === null) {
        settings.customerPlatformFeePercent = 5;
        updated = true;
      }
      if (settings.partnerPlatformFeePercent === undefined || settings.partnerPlatformFeePercent === null) {
        settings.partnerPlatformFeePercent = 10;
        updated = true;
      }
      if (settings.partnerCancellationPenaltyAmount === undefined || settings.partnerCancellationPenaltyAmount === null) {
        settings.partnerCancellationPenaltyAmount = 100;
        updated = true;
      }
      if (settings.maxDailyFreeCancellations === undefined || settings.maxDailyFreeCancellations === null) {
        settings.maxDailyFreeCancellations = 3;
        updated = true;
      }
      if (settings.partnerOnboardingFee === undefined || settings.partnerOnboardingFee === null) {
        settings.partnerOnboardingFee = 999;
        updated = true;
      }
      if (updated) {
        await settings.save();
      }
    }
    return settings;
  }

  async updateReferralSettings(data) {
    const { SystemSettings } = await import('../models/systemSettings.model.js');
    const update = {};

    if (data.customerPlatformFeePercent !== undefined && data.customerPlatformFeePercent !== '') {
      update.customerPlatformFeePercent = Number(data.customerPlatformFeePercent);
    }
    if (data.partnerPlatformFeePercent !== undefined && data.partnerPlatformFeePercent !== '') {
      update.partnerPlatformFeePercent = Number(data.partnerPlatformFeePercent);
    }
    if (data.referralBonusAmount !== undefined && data.referralBonusAmount !== '') {
      update.referralBonusAmount = Number(data.referralBonusAmount);
    }
    if (data.partnerCancellationPenaltyAmount !== undefined && data.partnerCancellationPenaltyAmount !== '') {
      update.partnerCancellationPenaltyAmount = Number(data.partnerCancellationPenaltyAmount);
    }
    if (data.maxDailyFreeCancellations !== undefined && data.maxDailyFreeCancellations !== '') {
      update.maxDailyFreeCancellations = Number(data.maxDailyFreeCancellations);
    }
    if (data.partnerOnboardingFee !== undefined && data.partnerOnboardingFee !== '') {
      update.partnerOnboardingFee = Number(data.partnerOnboardingFee);
    }
    if (data.currency !== undefined) {
      update.currency = data.currency;
    }

    const settings = await SystemSettings.findOneAndUpdate(
      { key: 'global_settings' },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return {
      message: 'Platform Settings & Commission Fees updated successfully!',
      settings,
    };
  }

  async getAllReferrals() {
    const { User } = await import('../models/user.model.js');
    const { WalletTransaction } = await import('../models/walletTransaction.model.js');

    const settings = await this.getReferralSettings();
    const bonusAmount = settings?.referralBonusAmount ?? 500;

    const referredUsers = await User.find({
      $or: [
        { referredBy: { $exists: true, $ne: '' } },
        { referredByPartner: { $exists: true, $ne: null } },
      ],
    })
      .populate('referredByPartner', 'name userId phone referralCode')
      .select('name userId phone email role city status kycStatus referredBy referredByPartner referralBonusStatus createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const referralTxns = await WalletTransaction.find({
      category: 'Referral Bonus',
    }).lean();

    const totalBonusPaid = referralTxns.reduce((sum, t) => sum + (t.amount || 0), 0);
    const totalReferredCount = referredUsers.length;

    return {
      referralSettings: settings,
      totalReferredCount,
      totalBonusPaid,
      referralList: referredUsers,
    };
  }

  // BANNER MANAGEMENT
  async getAllBanners() {
    const { Banner } = await import('../models/banner.model.js');
    return await Banner.find({}).sort({ displayOrder: 1, createdAt: -1 });
  }

  async createBanner(data) {
    const { Banner } = await import('../models/banner.model.js');
    const { title, subtitle, badgeText, imageUrl, gradientBg, targetType, targetValue, couponCode, isActive, displayOrder } = data;

    if (!title) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Banner title is required');
    }

    const banner = await Banner.create({
      title,
      subtitle: subtitle || '',
      badgeText: badgeText || 'SPECIAL OFFER',
      imageUrl: imageUrl || '',
      gradientBg: gradientBg || 'linear-gradient(135deg, #09331E 0%, #064e3b 50%, #0f172a 100%)',
      targetType: targetType || 'none',
      targetValue: targetValue || '',
      couponCode: couponCode ? String(couponCode).trim().toUpperCase() : '',
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      displayOrder: Number(displayOrder || 0),
    });

    return banner;
  }

  async updateBanner(id, data) {
    const { Banner } = await import('../models/banner.model.js');
    const banner = await Banner.findById(id);
    if (!banner) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Banner not found');
    }

    if (data.title !== undefined) banner.title = data.title;
    if (data.subtitle !== undefined) banner.subtitle = data.subtitle;
    if (data.badgeText !== undefined) banner.badgeText = data.badgeText;
    if (data.imageUrl !== undefined) banner.imageUrl = data.imageUrl;
    if (data.gradientBg !== undefined) banner.gradientBg = data.gradientBg;
    if (data.targetType !== undefined) banner.targetType = data.targetType;
    if (data.targetValue !== undefined) banner.targetValue = data.targetValue;
    if (data.couponCode !== undefined) banner.couponCode = String(data.couponCode).trim().toUpperCase();
    if (data.isActive !== undefined) banner.isActive = Boolean(data.isActive);
    if (data.displayOrder !== undefined) banner.displayOrder = Number(data.displayOrder);

    await banner.save();
    return banner;
  }

  async deleteBanner(id) {
    const { Banner } = await import('../models/banner.model.js');
    const banner = await Banner.findByIdAndDelete(id);
    if (!banner) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Banner not found');
    }
    return { message: 'Banner deleted successfully' };
  }

  async toggleBannerStatus(id) {
    const { Banner } = await import('../models/banner.model.js');
    const banner = await Banner.findById(id);
    if (!banner) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Banner not found');
    }
    banner.isActive = !banner.isActive;
    await banner.save();
    return banner;
  }

  // 6. FAQ MANAGEMENT
  async getAllFaqs(query = {}) {
    const { Faq } = await import('../models/faq.model.js');
    
    // Auto-seed default FAQs if DB has fewer items
    const count = await Faq.countDocuments();
    if (count < 10) {
      if (count > 0 && count < 10) {
        await Faq.deleteMany({});
      }
      await Faq.insertMany([
        // Customer FAQs
        {
          question: 'How do I track my assigned service partner?',
          answer: 'Once your booking is confirmed, you can track your assigned technician in real-time under the Active Bookings tab in your Norozz App.',
          targetAudience: 'customer',
          category: 'Booking & Order',
          displayOrder: 1,
        },
        {
          question: 'What is your refund policy if I cancel a booking?',
          answer: 'Bookings can be cancelled free of cost up to 2 hours before the scheduled time slot. Refunds are credited instantly to your Norozz Wallet or back to your original payment method within 24 hours.',
          targetAudience: 'customer',
          category: 'Payment & Wallet',
          displayOrder: 2,
        },
        {
          question: 'How can I contact Norozz Live AI Assistant for quick answers?',
          answer: 'You can open the Live AI Support Chat anytime from the Help Center or home screen banner to ask about service packages, pricing, booking status, or get instant recommendations.',
          targetAudience: 'customer',
          category: 'General',
          displayOrder: 3,
        },
        {
          question: 'Can I reschedule my service booking time slot?',
          answer: 'Yes, you can reschedule your booking up to 2 hours before the scheduled start time directly from your My Bookings screen without any extra charges.',
          targetAudience: 'customer',
          category: 'Booking & Order',
          displayOrder: 4,
        },
        {
          question: 'What payment methods are supported on Norozz?',
          answer: 'We support Credit/Debit Cards, Net Banking, UPI (Google Pay, PhonePe, Paytm), Norozz Customer Wallet, and Cash on Delivery (COD).',
          targetAudience: 'customer',
          category: 'Payment & Wallet',
          displayOrder: 5,
        },
        {
          question: 'What if I am not satisfied with the service quality?',
          answer: 'We offer a 30-Day Satisfaction Guarantee! If you face any issues after completion, request a re-visit from My Bookings and a senior technician will resolve it free of charge.',
          targetAudience: 'customer',
          category: 'General',
          displayOrder: 6,
        },
        {
          question: 'How do promo codes and coupons work during checkout?',
          answer: 'At checkout, tap on "Apply Promo Coupon Code" to view all available offers and select a active coupon for instant discounts on your booking total.',
          targetAudience: 'customer',
          category: 'Payment & Wallet',
          displayOrder: 7,
        },

        // Partner FAQs
        {
          question: 'How do I get paid for completed partner jobs?',
          answer: 'Earnings are calculated immediately after job completion and credited to your Partner Wallet upon customer OTP validation.',
          targetAudience: 'partner',
          category: 'Payments',
          displayOrder: 8,
        },
        {
          question: 'How do I accept a new booking request as a partner?',
          answer: 'When a new booking request appears in your service area, your app will play a loud sound alert. Tap "Accept Booking" within 30 seconds to claim the job.',
          targetAudience: 'partner',
          category: 'Bookings',
          displayOrder: 9,
        },
        {
          question: 'How do I request a wallet withdrawal to my bank account?',
          answer: 'Go to your Partner Wallet, enter the amount you wish to withdraw, select your verified bank account or UPI ID, and tap "Instant Withdraw". Funds settle within 2 hours.',
          targetAudience: 'partner',
          category: 'Payments',
          displayOrder: 10,
        },
        {
          question: 'What documents are required for partner onboarding?',
          answer: 'You need a valid Aadhaar Card, PAN Card, Driving License (for vehicle services), Bank Account details, and a clear selfie photo for instant Zoop One KYC verification.',
          targetAudience: 'partner',
          category: 'General',
          displayOrder: 11,
        },
        {
          question: 'What if a customer cancels the booking after I arrive at the location?',
          answer: 'If a customer cancels after you reach the location, a cancellation compensation fee is automatically credited to your Partner Wallet.',
          targetAudience: 'partner',
          category: 'Bookings',
          displayOrder: 12,
        },
        {
          question: 'How do high demand peak surge alerts work?',
          answer: 'During peak hours or heavy demand, high-demand areas pay bonus surge fees per booking. Enable Peak Notifications in Settings to get real-time alerts.',
          targetAudience: 'partner',
          category: 'Technical',
          displayOrder: 13,
        },

        // Both Audience FAQs
        {
          question: 'Are Norozz service partners background verified?',
          answer: 'Yes! All Norozz service partners undergo 100% Aadhaar KYC verification, police background checks, and technical skill certifications before joining.',
          targetAudience: 'both',
          category: 'Account & Safety',
          displayOrder: 14,
        },
        {
          question: 'How does Norozz protect my privacy and personal details?',
          answer: 'All user data and contact details are encrypted end-to-end. We never share your sensitive personal information with unauthorized third parties.',
          targetAudience: 'both',
          category: 'Account & Safety',
          displayOrder: 15,
        },
        {
          question: 'How can I reach Norozz support hotline?',
          answer: 'Our customer & partner support team is available 24/7 via toll-free phone (1800-200-9090), WhatsApp Support, or in-app Live AI Chat.',
          targetAudience: 'both',
          category: 'General',
          displayOrder: 16,
        },
      ]);
    }

    const filter = {};
    if (query.targetAudience && query.targetAudience !== 'all') {
      filter.targetAudience = { $in: [query.targetAudience, 'both'] };
    }
    if (query.search) {
      filter.$or = [
        { question: { $regex: query.search, $options: 'i' } },
        { answer: { $regex: query.search, $options: 'i' } },
        { category: { $regex: query.search, $options: 'i' } },
      ];
    }

    return await Faq.find(filter).sort({ displayOrder: 1, createdAt: -1 });
  }

  async createFaq(data) {
    const { Faq } = await import('../models/faq.model.js');
    const { question, answer, targetAudience, category, displayOrder, isActive } = data;

    if (!question || !answer) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Question and Answer are required');
    }

    const faq = await Faq.create({
      question: String(question).trim(),
      answer: String(answer).trim(),
      targetAudience: targetAudience || 'both',
      category: category ? String(category).trim() : 'General',
      displayOrder: Number(displayOrder || 0),
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    return faq;
  }

  async updateFaq(id, data) {
    const { Faq } = await import('../models/faq.model.js');
    const faq = await Faq.findById(id);
    if (!faq) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'FAQ not found');
    }

    if (data.question !== undefined) faq.question = String(data.question).trim();
    if (data.answer !== undefined) faq.answer = String(data.answer).trim();
    if (data.targetAudience !== undefined) faq.targetAudience = data.targetAudience;
    if (data.category !== undefined) faq.category = String(data.category).trim();
    if (data.displayOrder !== undefined) faq.displayOrder = Number(data.displayOrder);
    if (data.isActive !== undefined) faq.isActive = Boolean(data.isActive);

    await faq.save();
    return faq;
  }

  async deleteFaq(id) {
    const { Faq } = await import('../models/faq.model.js');
    const faq = await Faq.findByIdAndDelete(id);
    if (!faq) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'FAQ not found');
    }
    return { message: 'FAQ deleted successfully' };
  }

  async toggleFaqStatus(id) {
    const { Faq } = await import('../models/faq.model.js');
    const faq = await Faq.findById(id);
    if (!faq) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'FAQ not found');
    }
    faq.isActive = !faq.isActive;
    await faq.save();
    return faq;
  }

  // 7. CENTRAL SUPPORT TICKETS MANAGEMENT
  async getAllTickets(query = {}) {
    const { Ticket } = await import('../models/ticket.model.js');
    const filter = {};

    if (query.city && query.city !== 'all') {
      filter.city = { $regex: new RegExp(`^${query.city}$`, 'i') };
    }

    if (query.status && query.status !== 'all') {
      filter.status = query.status;
    }

    if (query.userType && query.userType !== 'all') {
      filter.userType = query.userType;
    }

    if (query.search) {
      filter.$or = [
        { ticketId: { $regex: query.search, $options: 'i' } },
        { subject: { $regex: query.search, $options: 'i' } },
        { userName: { $regex: query.search, $options: 'i' } },
        { userPhone: { $regex: query.search, $options: 'i' } },
        { bookingId: { $regex: query.search, $options: 'i' } },
        { city: { $regex: query.search, $options: 'i' } },
      ];
    }

    return await Ticket.find(filter).sort({ createdAt: -1 });
  }

  async updateTicketStatus(id, updateData) {
    const { Ticket } = await import('../models/ticket.model.js');
    const ticket = await Ticket.findById(id);
    if (!ticket) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Support ticket not found');
    }

    if (updateData.status) ticket.status = updateData.status;
    if (updateData.adminNote !== undefined) ticket.adminNote = updateData.adminNote;
    if (updateData.priority) ticket.priority = updateData.priority;

    if (updateData.status === 'Resolved' || updateData.status === 'Closed') {
      ticket.resolvedBy = updateData.resolvedBy || 'Super Admin';
      ticket.resolvedAt = new Date();
    }

    await ticket.save();
    return ticket;
  }

  async deleteTicket(id) {
    const { Ticket } = await import('../models/ticket.model.js');
    const ticket = await Ticket.findByIdAndDelete(id);
    if (!ticket) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Support ticket not found');
    }
    return { message: 'Support ticket deleted successfully' };
  }

  async replyToTicket(id, message, senderName) {
    const { Ticket } = await import('../models/ticket.model.js');
    if (!message?.trim()) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Reply message is required');
    }
    const ticket = await Ticket.findById(id);
    if (!ticket) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Support ticket not found');
    }
    ticket.replies.push({ message: message.trim(), senderType: 'admin', senderName });
    if (ticket.status === 'Open') ticket.status = 'In Progress';
    await ticket.save();
    return ticket;
  }
}

export const superAdminService = new SuperAdminService();
