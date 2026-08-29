import { Router } from 'express';
import { customerDashboardController } from '../controllers/customerDashboard.controller.js';
import { toggleFavoriteRules } from '../validators/customerDashboard.validator.js';
import { validate } from '../validators/index.js';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';
import { ROLES } from '../constants/roles.constant.js';

const router = Router();

// Protect ALL Customer Dashboard endpoints with JWT + Customer RBAC
router.use(verifyJWT);
router.use(authorizeRoles(ROLES.CUSTOMER));

// Combined Home Feed & Catalogs
router.get('/dashboard', customerDashboardController.getDashboard);
router.get('/categories', customerDashboardController.getCategories);
router.get('/services/popular', customerDashboardController.getPopularServices);
router.get('/services/featured', customerDashboardController.getFeaturedServices);
router.get('/offers', customerDashboardController.getOffers);
router.post('/coupons/apply', customerDashboardController.applyCoupon);

// Wallet & Customer Feeds
router.get('/wallet', customerDashboardController.getWallet);
router.post('/wallet/add-money', customerDashboardController.addWalletMoney);
router.get('/notifications', customerDashboardController.getNotifications);
router.get('/reviews', customerDashboardController.getReviews);

// Favorite Services Bookmarks
router.get('/favorites', customerDashboardController.getFavorites);
router.post('/favorites', toggleFavoriteRules, validate, customerDashboardController.toggleFavorite);

// Booking History & Filters
router.get('/bookings/history', customerDashboardController.getBookingHistory);
router.get('/bookings/upcoming', customerDashboardController.getUpcomingBookings);
router.get('/bookings/completed', customerDashboardController.getCompletedBookings);
router.get('/bookings/cancelled', customerDashboardController.getCancelledBookings);

// Referral System Endpoints
router.get('/referral', customerDashboardController.getReferralData);
router.post('/referral/invite', customerDashboardController.sendReferralInvite);

export default router;
