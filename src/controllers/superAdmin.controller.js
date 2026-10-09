import { BaseController } from './base.controller.js';
import { superAdminService } from '../services/superAdmin.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

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

  getAllReferrals = asyncHandler(async (req, res) => {
    const data = await superAdminService.getAllReferrals();
    return this.sendSuccess(res, data, 'Platform referral records retrieved successfully');
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

  // Banners CRUD
  getBanners = asyncHandler(async (req, res) => {
    const banners = await superAdminService.getAllBanners();
    return this.sendSuccess(res, banners, 'Promotional banners retrieved successfully');
  });

  createBanner = asyncHandler(async (req, res) => {
    const banner = await superAdminService.createBanner(req.body);
    return this.sendCreated(res, banner, 'Promotional banner created successfully');
  });

  updateBanner = asyncHandler(async (req, res) => {
    const banner = await superAdminService.updateBanner(req.params.id, req.body);
    return this.sendSuccess(res, banner, 'Promotional banner updated successfully');
  });

  deleteBanner = asyncHandler(async (req, res) => {
    const result = await superAdminService.deleteBanner(req.params.id);
    return this.sendSuccess(res, result, result.message);
  });

  toggleBannerStatus = asyncHandler(async (req, res) => {
    const banner = await superAdminService.toggleBannerStatus(req.params.id);
    return this.sendSuccess(res, banner, `Banner ${banner.isActive ? 'activated' : 'deactivated'} successfully`);
  });

  // 6. FAQ MANAGEMENT
  getAllFaqs = asyncHandler(async (req, res) => {
    const faqs = await superAdminService.getAllFaqs(req.query);
    return this.sendSuccess(res, faqs, 'FAQs retrieved successfully');
  });

  createFaq = asyncHandler(async (req, res) => {
    const faq = await superAdminService.createFaq(req.body);
    return this.sendSuccess(res, faq, 'FAQ created successfully', HTTP_STATUS.CREATED);
  });

  updateFaq = asyncHandler(async (req, res) => {
    const faq = await superAdminService.updateFaq(req.params.id, req.body);
    return this.sendSuccess(res, faq, 'FAQ updated successfully');
  });

  deleteFaq = asyncHandler(async (req, res) => {
    const result = await superAdminService.deleteFaq(req.params.id);
    return this.sendSuccess(res, result, result.message);
  });

  toggleFaqStatus = asyncHandler(async (req, res) => {
    const faq = await superAdminService.toggleFaqStatus(req.params.id);
    return this.sendSuccess(res, faq, `FAQ ${faq.isActive ? 'activated' : 'deactivated'} successfully`);
  });

  // 7. SUPPORT TICKETS MANAGEMENT
  getAllTickets = asyncHandler(async (req, res) => {
    const tickets = await superAdminService.getAllTickets(req.query);
    return this.sendSuccess(res, tickets, 'Support tickets retrieved successfully');
  });

  updateTicketStatus = asyncHandler(async (req, res) => {
    const ticket = await superAdminService.updateTicketStatus(req.params.id, req.body);
    return this.sendSuccess(res, ticket, 'Ticket status updated successfully');
  });

  deleteTicket = asyncHandler(async (req, res) => {
    const result = await superAdminService.deleteTicket(req.params.id);
    return this.sendSuccess(res, result, result.message);
  });

  replyToTicket = asyncHandler(async (req, res) => {
    const ticket = await superAdminService.replyToTicket(req.params.id, req.body.message, req.user.name || 'Super Admin');
    return this.sendSuccess(res, ticket, 'Reply sent successfully');
  });
}

export const superAdminController = new SuperAdminController();
