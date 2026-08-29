import { BaseController } from './base.controller.js';
import { customerDashboardService } from '../services/customerDashboard.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export class CustomerDashboardController extends BaseController {

  getDashboard = asyncHandler(async (req, res) => {
    const data = await customerDashboardService.getDashboardOverview(req.user);
    return this.sendSuccess(res, data, 'Customer Mobile Home Feed retrieved successfully');
  });

  getCategories = asyncHandler(async (req, res) => {
    const categories = await customerDashboardService.getCategories();
    return this.sendSuccess(res, categories, 'Popular service categories retrieved successfully');
  });

  getPopularServices = asyncHandler(async (req, res) => {
    const services = await customerDashboardService.getPopularServices();
    return this.sendSuccess(res, services, 'Popular services retrieved successfully');
  });

  getFeaturedServices = asyncHandler(async (req, res) => {
    const services = await customerDashboardService.getFeaturedServices();
    return this.sendSuccess(res, services, 'Featured services retrieved successfully');
  });

  getOffers = asyncHandler(async (req, res) => {
    const offers = await customerDashboardService.getOffers(req.user);
    return this.sendSuccess(res, offers, 'Promotional offers and coupons retrieved successfully');
  });

  applyCoupon = asyncHandler(async (req, res) => {
    const result = await customerDashboardService.applyCoupon(req.user, req.body);
    return this.sendSuccess(res, result, result.message);
  });

  getWallet = asyncHandler(async (req, res) => {
    const wallet = await customerDashboardService.getWallet(req.user);
    return this.sendSuccess(res, wallet, 'NOROZZ Wallet details retrieved successfully');
  });

  addWalletMoney = asyncHandler(async (req, res) => {
    const result = await customerDashboardService.addWalletMoney(req.user, req.body);
    return this.sendSuccess(res, result, result.message);
  });

  getNotifications = asyncHandler(async (req, res) => {
    const notifs = await customerDashboardService.getNotifications();
    return this.sendSuccess(res, notifs, 'Customer notifications retrieved successfully');
  });

  getReviews = asyncHandler(async (req, res) => {
    const reviews = await customerDashboardService.getReviews(req.user);
    return this.sendSuccess(res, reviews, 'Customer submitted reviews retrieved successfully');
  });

  getFavorites = asyncHandler(async (req, res) => {
    const favorites = await customerDashboardService.getFavorites(req.user);
    return this.sendSuccess(res, favorites, 'Favorite saved services retrieved successfully');
  });

  toggleFavorite = asyncHandler(async (req, res) => {
    const { serviceName } = req.body;
    const result = await customerDashboardService.toggleFavorite(req.user, serviceName);
    return this.sendSuccess(res, result, result.message);
  });

  getBookingHistory = asyncHandler(async (req, res) => {
    const history = await customerDashboardService.getBookingHistory(req.user);
    return this.sendSuccess(res, history, 'Complete booking history retrieved successfully');
  });

  getUpcomingBookings = asyncHandler(async (req, res) => {
    const upcoming = await customerDashboardService.getUpcomingBookings(req.user);
    return this.sendSuccess(res, upcoming, 'Upcoming active bookings retrieved successfully');
  });

  getCompletedBookings = asyncHandler(async (req, res) => {
    const completed = await customerDashboardService.getCompletedBookings(req.user);
    return this.sendSuccess(res, completed, 'Completed past bookings retrieved successfully');
  });

  getCancelledBookings = asyncHandler(async (req, res) => {
    const cancelled = await customerDashboardService.getCancelledBookings(req.user);
    return this.sendSuccess(res, cancelled, 'Cancelled bookings retrieved successfully');
  });

  getReferralData = asyncHandler(async (req, res) => {
    const data = await customerDashboardService.getReferralData(req.user);
    return this.sendSuccess(res, data, 'Customer referral data retrieved successfully');
  });

  sendReferralInvite = asyncHandler(async (req, res) => {
    const result = await customerDashboardService.sendReferralInvite(req.user, req.body);
    return this.sendSuccess(res, result, result.message);
  });
}

export const customerDashboardController = new CustomerDashboardController();
