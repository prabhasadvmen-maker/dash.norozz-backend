import { BaseController } from './base.controller.js';
import { superAdminService } from '../services/superAdmin.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export class SuperAdminController extends BaseController {

  getDashboard = asyncHandler(async (req, res) => {
    const stats = await superAdminService.getDashboardStats();
    return this.sendSuccess(res, stats, 'Master Dashboard Statistics retrieved successfully');
  });

  getCityAdmins = asyncHandler(async (req, res) => {
    const admins = await superAdminService.getAllCityAdmins();
    return this.sendSuccess(res, admins, 'City Admins directory retrieved successfully');
  });

  createCityAdmin = asyncHandler(async (req, res) => {
    const newAdmin = await superAdminService.createCityAdmin(req.body, req.user._id);
    return this.sendCreated(res, newAdmin, 'City Admin created and assigned successfully');
  });

  updateCityAdmin = asyncHandler(async (req, res) => {
    const updatedAdmin = await superAdminService.updateCityAdmin(req.params.id, req.body, req.user._id);
    return this.sendSuccess(res, updatedAdmin, 'City Admin updated successfully');
  });

  deleteCityAdmin = asyncHandler(async (req, res) => {
    const result = await superAdminService.deleteCityAdmin(req.params.id);
    return this.sendSuccess(res, result, result.message);
  });

  suspendCityAdmin = asyncHandler(async (req, res) => {
    const { status } = req.body;
    const result = await superAdminService.suspendCityAdmin(req.params.id, status);
    return this.sendSuccess(res, result, result.message);
  });

  resetCityAdminPassword = asyncHandler(async (req, res) => {
    const { password } = req.body;
    const result = await superAdminService.resetCityAdminPassword(req.params.id, password);
    return this.sendSuccess(res, result, result.message);
  });

  impersonateCityAdmin = asyncHandler(async (req, res) => {
    const result = await superAdminService.impersonateCityAdmin(req.params.id);
    return this.sendSuccess(res, result, result.message);
  });

  getCustomers = asyncHandler(async (req, res) => {
    const customers = await superAdminService.getAllCustomers();
    return this.sendSuccess(res, customers, 'Customers directory retrieved successfully');
  });

  getPartners = asyncHandler(async (req, res) => {
    const partners = await superAdminService.getAllPartners();
    return this.sendSuccess(res, partners, 'Partners directory retrieved successfully');
  });

  getBookings = asyncHandler(async (req, res) => {
    const bookings = await superAdminService.getAllBookings();
    return this.sendSuccess(res, bookings, 'Platform bookings master log retrieved successfully');
  });

  getReferralSettings = asyncHandler(async (req, res) => {
    const settings = await superAdminService.getReferralSettings();
    return this.sendSuccess(res, settings, 'Referral settings retrieved successfully');
  });

  updateReferralSettings = asyncHandler(async (req, res) => {
    const result = await superAdminService.updateReferralSettings(req.body);
    return this.sendSuccess(res, result, result.message);
  });

  // Coupons CRUD
  getCoupons = asyncHandler(async (req, res) => {
    const coupons = await superAdminService.getAllCoupons();
    return this.sendSuccess(res, coupons, 'Coupons directory retrieved successfully');
  });

  createCoupon = asyncHandler(async (req, res) => {
    const result = await superAdminService.createCoupon(req.body);
    return this.sendCreated(res, result.coupon, result.message);
  });

  updateCoupon = asyncHandler(async (req, res) => {
    const result = await superAdminService.updateCoupon(req.params.id, req.body);
    return this.sendSuccess(res, result.coupon, result.message);
  });

  deleteCoupon = asyncHandler(async (req, res) => {
    const result = await superAdminService.deleteCoupon(req.params.id);
    return this.sendSuccess(res, result, result.message);
  });
}

export const superAdminController = new SuperAdminController();
