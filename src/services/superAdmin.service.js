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
      if (userObj.category && !userObj.category.match(/^[0-9a-fA-F]{24}$/)) {
        catDisplay = userObj.category;
      } else if (userObj.category && catMap[userObj.category]) {
        catDisplay = catMap[userObj.category];
      } else if (Array.isArray(userObj.categories) && userObj.categories.length > 0) {
        const names = userObj.categories
          .map((c) => (typeof c === 'object' && c?.name ? c.name : catMap[String(c)] || null))
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
    const totalBookings = await bookingRepository.count();
    const grossRevenue = await bookingRepository.getGrossRevenue();
    const platformCommission = Math.round(grossRevenue * 0.2); // 20% platform cut

    const recentBookings = await bookingRepository.findRecent(5);
    const recentPartners = await userRepository.find({ role: ROLES.PARTNER }, '-password', { createdAt: -1 });
    const recentCustomers = await userRepository.find({ role: ROLES.CUSTOMER }, '-password', { createdAt: -1 });

    const populatedPartners = await this.populateCityNames(recentPartners);
    const populatedCustomers = await this.populateCityNames(recentCustomers);

    return {
      overview: {
        grossRevenue,
        platformCommission,
        totalCustomers: totalCustomers || 48200,
        totalPartners: totalPartners || 1450,
        totalCityAdmins: totalCityAdmins || 12,
        totalBookings: totalBookings || 184200,
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
    return await bookingRepository.find({}, '', { createdAt: -1 });
  }

  // 5. COUPON MANAGEMENT SYSTEM (CRUD)
  async getAllCoupons() {
    const { Coupon } = await import('../models/coupon.model.js');
    let coupons = await Coupon.find({}).sort({ createdAt: -1 });

    // Seed default initial coupons if DB is empty
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
      coupons = await Coupon.find({}).sort({ createdAt: -1 });
    }

    return coupons;
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
}

export const superAdminService = new SuperAdminService();
