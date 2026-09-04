import { BaseController } from './base.controller.js';
import { partnerDashboardService } from '../services/partnerDashboard.service.js';
import { bookingService } from '../services/booking.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export class PartnerDashboardController extends BaseController {

  getFaqs = asyncHandler(async (req, res) => {
    const faqs = await partnerDashboardService.getFaqs();
    return this.sendSuccess(res, faqs, 'Partner FAQs retrieved successfully');
  });

  getOfferedServices = asyncHandler(async (req, res) => {
    const services = await partnerDashboardService.getOfferedServices(req.user, req.query);
    return this.sendSuccess(res, services, 'Partner offered extra services retrieved successfully');
  });

  claimJobOffer = asyncHandler(async (req, res) => {
    const result = await bookingService.claimJobOffer(req.params.id, req.user);
    return this.sendSuccess(res, result, result.message);
  });

  verifyOtp = asyncHandler(async (req, res) => {
    const result = await bookingService.verifyCompletionOtp(req.params.id, req.user, req.body.otp);
    return this.sendSuccess(res, result, result.message);
  });

  addExtraService = asyncHandler(async (req, res) => {
    const result = await bookingService.addExtraService(req.params.id, req.user, req.body);
    return this.sendSuccess(res, result, result.message);
  });

  getServicePackages = asyncHandler(async (req, res) => {
    const packages = await bookingService.getServicePackages(req.params.serviceId);
    return this.sendSuccess(res, packages, 'Service packages retrieved successfully');
  });

  calculatePayableAmount = asyncHandler(async (req, res) => {
    const result = await bookingService.calculatePayableAmount(req.params.id);
    return this.sendSuccess(res, result, 'Payable amount calculated successfully');
  });

  verifyExtraPayment = asyncHandler(async (req, res) => {
    const result = await bookingService.verifyExtraPayment(req.params.id, req.body);
    return this.sendSuccess(res, result, result.message);
  });

  getDashboard = asyncHandler(async (req, res) => {
    const data = await partnerDashboardService.getDashboardOverview(req.user);
    return this.sendSuccess(res, data, 'Partner Dashboard overview retrieved successfully');
  });

  getTodayBookings = asyncHandler(async (req, res) => {
    const bookings = await partnerDashboardService.getTodayBookings(req.user);
    return this.sendSuccess(res, bookings, "Today's bookings retrieved successfully");
  });

  getPendingBookings = asyncHandler(async (req, res) => {
    const bookings = await partnerDashboardService.getPendingBookings(req.user);
    return this.sendSuccess(res, bookings, 'Pending bookings retrieved successfully');
  });

  getCompletedBookings = asyncHandler(async (req, res) => {
    const bookings = await partnerDashboardService.getCompletedBookings(req.user);
    return this.sendSuccess(res, bookings, 'Completed bookings retrieved successfully');
  });

  getCancelledBookings = asyncHandler(async (req, res) => {
    const bookings = await partnerDashboardService.getCancelledBookings(req.user);
    return this.sendSuccess(res, bookings, 'Cancelled bookings retrieved successfully');
  });

  getAllBookings = asyncHandler(async (req, res) => {
    const bookings = await partnerDashboardService.getAllBookings(req.user);
    return this.sendSuccess(res, bookings, 'All partner bookings retrieved successfully');
  });

  getBookingDetails = asyncHandler(async (req, res) => {
    const booking = await partnerDashboardService.getBookingDetails(req.user, req.params.id);
    return this.sendSuccess(res, booking, 'Single booking details with customer profile & history retrieved successfully');
  });

  getWallet = asyncHandler(async (req, res) => {
    const wallet = await partnerDashboardService.getWallet(req.user);
    return this.sendSuccess(res, wallet, 'Partner wallet balance retrieved successfully');
  });

  getEarnings = asyncHandler(async (req, res) => {
    const earnings = await partnerDashboardService.getEarnings(req.user);
    return this.sendSuccess(res, earnings, 'Earnings & performance analytics retrieved successfully');
  });

  requestWithdrawal = asyncHandler(async (req, res) => {
    const result = await partnerDashboardService.requestWithdrawal(req.user._id, req.body.amount);
    return this.sendSuccess(res, result, result.message);
  });

  addDepositToWallet = asyncHandler(async (req, res) => {
    const result = await partnerDashboardService.addDepositToWallet(req.user._id, req.body.amount);
    return this.sendSuccess(res, result, result.message);
  });

  getRating = asyncHandler(async (req, res) => {
    const rating = await partnerDashboardService.getRating(req.user);
    return this.sendSuccess(res, rating, 'Rating metrics retrieved successfully');
  });

  getReviews = asyncHandler(async (req, res) => {
    const reviews = await partnerDashboardService.getReviews(req.user);
    return this.sendSuccess(res, reviews, 'Customer reviews retrieved successfully');
  });

  getProfile = asyncHandler(async (req, res) => {
    const profile = await partnerDashboardService.getProfile(req.user);
    return this.sendSuccess(res, profile, 'Partner profile retrieved successfully');
  });

  updateProfile = asyncHandler(async (req, res) => {
    const updated = await partnerDashboardService.updateProfile(req.user._id, req.body);
    return this.sendSuccess(res, updated, 'Partner profile updated successfully');
  });

  getAvailability = asyncHandler(async (req, res) => {
    const availability = await partnerDashboardService.getAvailability(req.user);
    return this.sendSuccess(res, availability, 'Partner availability retrieved successfully');
  });

  updateAvailability = asyncHandler(async (req, res) => {
    const result = await partnerDashboardService.updateAvailability(req.user._id, req.body);
    return this.sendSuccess(res, result, result.message);
  });

  getDocuments = asyncHandler(async (req, res) => {
    const docs = await partnerDashboardService.getDocuments(req.user);
    return this.sendSuccess(res, docs, 'Uploaded KYC documents retrieved successfully');
  });

  getNotifications = asyncHandler(async (req, res) => {
    const notifs = await partnerDashboardService.getNotifications(req.user);
    return this.sendSuccess(res, notifs, 'Partner notifications retrieved successfully');
  });

  updateSettingsPreferences = asyncHandler(async (req, res) => {
    const result = await partnerDashboardService.updateSettingsPreferences(req.user._id, req.body);
    return this.sendSuccess(res, result, result.message);
  });

  changePassword = asyncHandler(async (req, res) => {
    const result = await partnerDashboardService.changePassword(req.user._id, req.body);
    return this.sendSuccess(res, result, result.message);
  });

  submitComplaint = asyncHandler(async (req, res) => {
    const complaint = await partnerDashboardService.submitComplaint(req.user._id, req.body);
    return this.sendSuccess(res, complaint, 'Complaint submitted successfully');
  });

  getComplaints = asyncHandler(async (req, res) => {
    const complaints = await partnerDashboardService.getComplaints(req.user._id);
    return this.sendSuccess(res, complaints, 'Complaints list retrieved successfully');
  });

  getChatMessages = asyncHandler(async (req, res) => {
    const messages = await partnerDashboardService.getChatMessages(req.user._id);
    return this.sendSuccess(res, messages, 'Support chat messages retrieved successfully');
  });

  sendChatMessage = asyncHandler(async (req, res) => {
    const messages = await partnerDashboardService.sendChatMessage(req.user._id, req.body);
    return this.sendSuccess(res, messages, 'Chat message sent successfully');
  });

  getReferralData = asyncHandler(async (req, res) => {
    const data = await partnerDashboardService.getReferralData(req.user);
    return this.sendSuccess(res, data, 'Partner referral data retrieved successfully');
  });
}

export const partnerDashboardController = new PartnerDashboardController();
