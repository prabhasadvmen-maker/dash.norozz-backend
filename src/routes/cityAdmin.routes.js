import { Router } from 'express';
import { cityAdminController } from '../controllers/cityAdmin.controller.js';
import {
  rejectPartnerRules,
  assignBookingRules,
  cancelBookingRules,
} from '../validators/cityAdmin.validator.js';
import { validate } from '../validators/index.js';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';
import { ROLES } from '../constants/roles.constant.js';

const router = Router();

// Protect ALL City Admin endpoints with JWT + CityAdmin / SuperAdmin RBAC
router.use(verifyJWT);
router.use(authorizeRoles(ROLES.SUPER_ADMIN, ROLES.CITY_ADMIN, ROLES.ADMIN));

// City Dashboard & Revenue Analytics
router.get('/dashboard', cityAdminController.getDashboard);
router.get('/revenue', cityAdminController.getRevenue);
router.get('/payments/overview', cityAdminController.getPaymentsOverview);
router.get('/payments/transactions', cityAdminController.getPaymentTransactions);
router.get('/payments/export', cityAdminController.exportPaymentTransactions);
router.get('/reports/overview', cityAdminController.getReportsOverview);
router.get('/reports/export', cityAdminController.exportReportBookings);

// Partner KYC & Account Management (Assigned City Scope)
router.get('/partners', cityAdminController.getPartners);
router.get('/customers', cityAdminController.getCustomers);
router.get('/partners/:id/profile', cityAdminController.getPartnerProfile);
router.patch('/partners/:id/approve', cityAdminController.approvePartner);
router.patch('/partners/:id/reject', rejectPartnerRules, validate, cityAdminController.rejectPartner);
router.patch('/partners/:id/documents/status', cityAdminController.updateDocumentStatus);
router.patch('/partners/:id/verify-kyc', cityAdminController.verifyKyc);
router.patch('/partners/:id/suspend', cityAdminController.suspendPartner);
router.patch('/partners/:id/activate', cityAdminController.activatePartner);

// City Bookings & Dispatch Management (Assigned City Scope)
router.get('/bookings', cityAdminController.getBookings);
router.patch('/bookings/:id/assign', assignBookingRules, validate, cityAdminController.assignBooking);
router.patch('/bookings/:id/cancel', cancelBookingRules, validate, cityAdminController.cancelBooking);

// City Support Tickets Management (Assigned City Scope)
router.get('/tickets', cityAdminController.getTickets);
router.put('/tickets/:id', cityAdminController.updateTicketStatus);

export default router;
