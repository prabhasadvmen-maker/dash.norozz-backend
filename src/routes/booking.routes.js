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
import { authorizeRoles } from '../middleware/role.middleware.js';
import { ROLES } from '../constants/roles.constant.js';

const router = Router();

const ADMINS = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CITY_ADMIN];

// Require Authentication for ALL Booking Endpoints
router.use(verifyJWT);

// ── Customer ──
router.get('/my-bookings', authorizeRoles(ROLES.CUSTOMER), bookingController.getMyBookings);
router.get('/partner-profile/:partnerId', authorizeRoles(ROLES.CUSTOMER, ...ADMINS), bookingController.getPartnerPublicProfile);
router.post('/', authorizeRoles(ROLES.CUSTOMER), createBookingRules, validate, bookingController.createBooking);
router.post('/:id/pay', authorizeRoles(ROLES.CUSTOMER), payBookingRules, validate, bookingController.processPayment);
router.post('/:id/rate', authorizeRoles(ROLES.CUSTOMER), rateBookingRules, validate, bookingController.rateBooking);
router.patch('/:id/cancel', authorizeRoles(ROLES.CUSTOMER, ...ADMINS), cancelBookingRules, validate, bookingController.cancelBooking);

// ── Shared lookups (ownership is enforced in the service layer) ──
router.get('/services/:serviceId/packages', bookingController.getServicePackages);
router.get('/:id', bookingController.getBookingById);
router.get('/:id/payable-amount', bookingController.calculatePayableAmount);

// ── Partner ──
router.post('/:id/verify-extra-payment', authorizeRoles(ROLES.PARTNER), bookingController.verifyExtraPayment);
router.patch('/:id/accept', authorizeRoles(ROLES.PARTNER), bookingController.acceptBooking);
router.patch('/:id/on-the-way', authorizeRoles(ROLES.PARTNER), bookingController.onTheWayBooking);
router.patch('/:id/start', authorizeRoles(ROLES.PARTNER), bookingController.startBooking);
router.patch('/:id/complete', authorizeRoles(ROLES.PARTNER), bookingController.completeBooking);

// ── Admin ──
router.patch('/:id/assign', authorizeRoles(...ADMINS), assignBookingRules, validate, bookingController.assignPartner);

export default router;
