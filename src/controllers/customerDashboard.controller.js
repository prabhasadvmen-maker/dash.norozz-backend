import { BaseController } from './base.controller.js';
import { customerDashboardService } from '../services/customerDashboard.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export class CustomerDashboardController extends BaseController {

  getDashboard = asyncHandler(async (req, res) => {
    const data = await customerDashboardService.getDashboardOverview(req.user);
    return this.sendSuccess(res, data, 'Customer Mobile Home Feed retrieved successfully');
  });

  getFaqs = asyncHandler(async (req, res) => {
    const faqs = await customerDashboardService.getFaqs();
    return this.sendSuccess(res, faqs, 'Customer FAQs retrieved successfully');
  });

  getBanners = asyncHandler(async (req, res) => {
    const banners = await customerDashboardService.getBanners();
    return this.sendSuccess(res, banners, 'Customer promotional banners retrieved successfully');
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

  getSystemSettings = asyncHandler(async (req, res) => {
    const settings = await customerDashboardService.getSystemSettings();
    return this.sendSuccess(res, settings, 'Global system settings retrieved successfully');
  });

  getAiChatHistory = asyncHandler(async (req, res) => {
    const { aiChatService } = await import('../services/aiChat.service.js');
    const history = await aiChatService.getChatHistory(req.user);
    return this.sendSuccess(res, history, 'Customer AI chat history retrieved successfully');
  });

  clearAiChatHistory = asyncHandler(async (req, res) => {
    const { aiChatService } = await import('../services/aiChat.service.js');
    const result = await aiChatService.clearChatHistory(req.user);
    return this.sendSuccess(res, result, 'Customer AI chat history cleared successfully');
  });

  chatWithAi = asyncHandler(async (req, res) => {
    const { aiChatService } = await import('../services/aiChat.service.js');
    const { message } = req.body;
    const result = await aiChatService.getChatCompletion(req.user, message);
    return this.sendSuccess(res, result, 'Norozz AI response generated successfully');
  });

  createTicket = asyncHandler(async (req, res) => {
    const ticket = await customerDashboardService.createTicket(req.user?._id, req.body);
    return this.sendCreated(res, ticket, 'Support ticket submitted successfully!');
  });

  getUserTickets = asyncHandler(async (req, res) => {
    const tickets = await customerDashboardService.getUserTickets(req.user?._id);
    return this.sendSuccess(res, tickets, 'Customer tickets retrieved successfully');
  });
}

export const customerDashboardController = new CustomerDashboardController();
