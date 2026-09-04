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
    return await Coupon.find({}).sort({ createdAt: -1 });
  }

  async createCoupon(data) {
    const { Coupon } = await import('../models/coupon.model.js');
    const existing = await Coupon.findOne({ code: data.code.toUpperCase() });
    if (existing) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, `Coupon code '${data.code.toUpperCase()}' already exists`);
    }

    const coupon = await Coupon.create({
      code: data.code.toUpperCase(),
      title: data.title,
      description: data.description || '',
      discountType: data.discountType || 'fixed',
      discountValue: Number(data.discountValue),
      maxDiscountAmount: data.maxDiscountAmount ? Number(data.maxDiscountAmount) : null,
      minBookingAmount: data.minBookingAmount ? Number(data.minBookingAmount) : 0,
      usageLimitPerUser: data.usageLimitPerUser ? Number(data.usageLimitPerUser) : 1,
      validUntil: data.validUntil ? new Date(data.validUntil) : null,
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    });

    return {
      message: 'Coupon created successfully!',
      coupon,
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
    if (data.discountType !== undefined) coupon.discountType = data.discountType;
    if (data.discountValue !== undefined) coupon.discountValue = Number(data.discountValue);
    if (data.maxDiscountAmount !== undefined) coupon.maxDiscountAmount = data.maxDiscountAmount ? Number(data.maxDiscountAmount) : null;
    if (data.minBookingAmount !== undefined) coupon.minBookingAmount = Number(data.minBookingAmount);
    if (data.usageLimitPerUser !== undefined) coupon.usageLimitPerUser = Number(data.usageLimitPerUser);
    if (data.validUntil !== undefined) coupon.validUntil = data.validUntil ? new Date(data.validUntil) : null;
    if (data.isActive !== undefined) coupon.isActive = Boolean(data.isActive);

    await coupon.save();
    return {
      message: 'Coupon updated successfully!',
      coupon,
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
}

export const superAdminService = new SuperAdminService();
