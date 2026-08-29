import { Router } from 'express';
import { bookingController } from '../controllers/booking.controller.js';
import {
  createBookingRules,
  payBookingRules,
  assignBookingRules,
  rateBookingRules,
  cancelBookingRules,
} from '../validators/booking.validator.js';
import { validate } from '../validators/index.js';
import { verifyJWT } from '../middleware/auth.middleware.js';

const router = Router();

// Require Authentication for ALL Booking Endpoints
router.use(verifyJWT);

// Customer Booking Lifecycle & Orders
router.get('/my-bookings', bookingController.getMyBookings);
router.get('/partner-profile/:partnerId', bookingController.getPartnerPublicProfile);
router.get('/:id', bookingController.getBookingById);
router.post('/', createBookingRules, validate, bookingController.createBooking);
router.post('/:id/pay', payBookingRules, validate, bookingController.processPayment);
router.post('/:id/rate', rateBookingRules, validate, bookingController.rateBooking);
router.patch('/:id/cancel', cancelBookingRules, validate, bookingController.cancelBooking);

// Partner & Admin Dispatch Status Transitions
router.patch('/:id/assign', assignBookingRules, validate, bookingController.assignPartner);
router.patch('/:id/accept', bookingController.acceptBooking);
router.patch('/:id/on-the-way', bookingController.onTheWayBooking);
router.patch('/:id/start', bookingController.startBooking);
router.patch('/:id/complete', bookingController.completeBooking);

export default router;
