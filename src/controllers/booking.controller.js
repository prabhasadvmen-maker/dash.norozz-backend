import { BaseController } from './base.controller.js';
import { bookingService } from '../services/booking.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export class BookingController extends BaseController {

  createBooking = asyncHandler(async (req, res) => {
    const booking = await bookingService.createBooking(req.user, req.body);
    return this.sendCreated(res, booking, 'Booking created successfully');
  });

  processPayment = asyncHandler(async (req, res) => {
    const result = await bookingService.processPayment(req.params.id, req.body.paymentMethod);
    return this.sendSuccess(res, result, result.message);
  });

  assignPartner = asyncHandler(async (req, res) => {
    const result = await bookingService.assignPartner(req.params.id, req.body.partnerId);
    return this.sendSuccess(res, result, result.message);
  });

  acceptBooking = asyncHandler(async (req, res) => {
    const result = await bookingService.acceptBooking(req.params.id, req.user);
    return this.sendSuccess(res, result, result.message);
  });

  onTheWayBooking = asyncHandler(async (req, res) => {
    const result = await bookingService.onTheWayBooking(req.params.id, req.user);
    return this.sendSuccess(res, result, result.message);
  });

  startBooking = asyncHandler(async (req, res) => {
    const result = await bookingService.startBooking(req.params.id, req.user);
    return this.sendSuccess(res, result, result.message);
  });

  completeBooking = asyncHandler(async (req, res) => {
    const result = await bookingService.completeBooking(req.params.id, req.user);
    return this.sendSuccess(res, result, result.message);
  });

  rateBooking = asyncHandler(async (req, res) => {
    const { rating, reviewComment } = req.body;
    const result = await bookingService.rateBooking(req.params.id, req.user, rating, reviewComment);
    return this.sendSuccess(res, result, result.message);
  });

  cancelBooking = asyncHandler(async (req, res) => {
    const { reason } = req.body;
    const result = await bookingService.cancelBooking(req.params.id, req.user, reason);
    return this.sendSuccess(res, result, result.message);
  });

  getMyBookings = asyncHandler(async (req, res) => {
    const bookings = await bookingService.getCustomerBookings(req.user._id);
    return this.sendSuccess(res, bookings, 'Customer bookings retrieved successfully');
  });

  getBookingById = asyncHandler(async (req, res) => {
    const booking = await bookingService.getBookingById(req.params.id);
    return this.sendSuccess(res, booking, 'Booking details retrieved successfully');
  });

  getPartnerPublicProfile = asyncHandler(async (req, res) => {
    const profile = await bookingService.getPartnerPublicProfile(req.params.partnerId);
    return this.sendSuccess(res, profile, 'Partner public profile retrieved successfully');
  });
}

export const bookingController = new BookingController();
