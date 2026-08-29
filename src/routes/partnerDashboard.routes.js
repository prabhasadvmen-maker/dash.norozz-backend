import { Router } from 'express';
import { partnerDashboardController } from '../controllers/partnerDashboard.controller.js';
import {
  updateProfileRules,
  updateAvailabilityRules,
} from '../validators/partnerDashboard.validator.js';
import { validate } from '../validators/index.js';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';
import { ROLES } from '../constants/roles.constant.js';

const router = Router();

// Protect ALL Partner Dashboard endpoints with JWT + Partner RBAC
router.use(verifyJWT);
router.use(authorizeRoles(ROLES.PARTNER));

// Dashboard Overview
router.get('/dashboard', partnerDashboardController.getDashboard);

// Booking Endpoints (Subject to KYC Approval Check)
router.get('/bookings/today', partnerDashboardController.getTodayBookings);
router.get('/bookings/pending', partnerDashboardController.getPendingBookings);
router.get('/bookings/completed', partnerDashboardController.getCompletedBookings);
router.get('/bookings/cancelled', partnerDashboardController.getCancelledBookings);
router.get('/bookings/all', partnerDashboardController.getAllBookings);
router.get('/bookings/:id', partnerDashboardController.getBookingDetails);
router.post('/bookings/:id/accept-job', partnerDashboardController.claimJobOffer);
router.post('/bookings/:id/verify-otp', partnerDashboardController.verifyOtp);
router.post('/bookings/:id/add-extra-service', partnerDashboardController.addExtraService);

// Wallet & Financials
router.get('/wallet', partnerDashboardController.getWallet);
router.post('/wallet/withdraw', partnerDashboardController.requestWithdrawal);
router.get('/earnings', partnerDashboardController.getEarnings);

// Ratings & Customer Reviews
router.get('/rating', partnerDashboardController.getRating);
router.get('/reviews', partnerDashboardController.getReviews);

// Profile & Account Management
router.get('/profile', partnerDashboardController.getProfile);
router.put('/profile', updateProfileRules, validate, partnerDashboardController.updateProfile);

// Availability & Working Hours Toggles
router.get('/availability', partnerDashboardController.getAvailability);
router.put('/availability', updateAvailabilityRules, validate, partnerDashboardController.updateAvailability);

// Documents & Notifications Feed
router.get('/documents', partnerDashboardController.getDocuments);
router.get('/notifications', partnerDashboardController.getNotifications);

// Settings, Password, Complaints & Live Chat Endpoints
router.put('/settings/preferences', partnerDashboardController.updateSettingsPreferences);
router.post('/settings/change-password', partnerDashboardController.changePassword);
router.post('/complaints', partnerDashboardController.submitComplaint);
router.get('/complaints', partnerDashboardController.getComplaints);
router.get('/chat', partnerDashboardController.getChatMessages);
router.post('/chat', partnerDashboardController.sendChatMessage);

export default router;
