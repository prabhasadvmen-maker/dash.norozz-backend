import { Router } from 'express';
import { superAdminController } from '../controllers/superAdmin.controller.js';
import {
  createCityAdminRules,
  updateCityAdminRules,
  resetCityAdminPasswordRules,
  updateCityAdminStatusRules,
} from '../validators/superAdmin.validator.js';
import { validate } from '../validators/index.js';
import { partnerHiringController } from '../controllers/partnerHiring.controller.js';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';
import { ROLES } from '../constants/roles.constant.js';

const router = Router();

// Protect ALL Super Admin endpoints with JWT + SuperAdmin RBAC
router.use(verifyJWT);
router.use(authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN));

// Dashboard Statistics & Analytics
router.get('/dashboard', superAdminController.getDashboard);

// Platform Growth & Financial Reports (revenue by city, partner payouts, GST log)
router.get('/reports/overview', superAdminController.getReportsOverview);
router.get('/reports/export', superAdminController.exportReport);

// City Admin Management (CRUD)
router.get('/city-admins', superAdminController.getCityAdmins);
router.post('/city-admins', createCityAdminRules, validate, superAdminController.createCityAdmin);
router.put('/city-admins/:id', updateCityAdminRules, validate, superAdminController.updateCityAdmin);
router.delete('/city-admins/:id', superAdminController.deleteCityAdmin);
router.patch('/city-admins/:id/status', updateCityAdminStatusRules, validate, superAdminController.suspendCityAdmin);
router.patch('/city-admins/:id/reset-password', resetCityAdminPasswordRules, validate, superAdminController.resetCityAdminPassword);
router.post('/city-admins/:id/impersonate', superAdminController.impersonateCityAdmin);
router.post('/city-admin/:id/impersonate', superAdminController.impersonateCityAdmin);
router.post('/impersonate/:id', superAdminController.impersonateCityAdmin);

// Partner Hiring Applications (review & verification)
router.get('/partner-hiring/stats', partnerHiringController.adminStats);
router.get('/partner-hiring', partnerHiringController.adminList);
router.get('/partner-hiring/:id', partnerHiringController.adminGet);
router.patch('/partner-hiring/:id/review', partnerHiringController.adminReview);

// Master Platform Directories
router.get('/customers', superAdminController.getCustomers);
router.get('/partners', superAdminController.getPartners);
router.get('/bookings', superAdminController.getBookings);

// Global Referral Bonus Settings & Platform Referral Log
router.get('/referral-settings', superAdminController.getReferralSettings);
router.put('/referral-settings', superAdminController.updateReferralSettings);
router.get('/referrals', superAdminController.getAllReferrals);

// Coupon Management CRUD
router.get('/coupons', superAdminController.getCoupons);
router.post('/coupons', superAdminController.createCoupon);
router.put('/coupons/:id', superAdminController.updateCoupon);
router.delete('/coupons/:id', superAdminController.deleteCoupon);

// Banner Management CRUD
router.get('/banners', superAdminController.getBanners);
router.post('/banners', superAdminController.createBanner);
router.put('/banners/:id', superAdminController.updateBanner);
router.delete('/banners/:id', superAdminController.deleteBanner);
router.patch('/banners/:id/status', superAdminController.toggleBannerStatus);

// FAQ Management CRUD
router.get('/faqs', superAdminController.getAllFaqs);
router.post('/faqs', superAdminController.createFaq);
router.put('/faqs/:id', superAdminController.updateFaq);
router.delete('/faqs/:id', superAdminController.deleteFaq);
router.patch('/faqs/:id/status', superAdminController.toggleFaqStatus);

// Support Ticket Management CRUD
router.get('/tickets', superAdminController.getAllTickets);
router.put('/tickets/:id', superAdminController.updateTicketStatus);
router.post('/tickets/:id/reply', superAdminController.replyToTicket);
router.delete('/tickets/:id', superAdminController.deleteTicket);

// Legal Policy Management (Privacy Policy & Terms for Customer & Partner Apps)
import { legalPolicyController } from '../controllers/legalPolicy.controller.js';
import { starterPackController } from '../controllers/starterPack.controller.js';

router.get('/policies', legalPolicyController.getAllPolicies);
router.get('/policies/:targetApp/:type', legalPolicyController.getPolicy);
router.post('/policies/:targetApp/:type', legalPolicyController.savePolicy);
router.put('/policies/:targetApp/:type', legalPolicyController.savePolicy);

// Starter Pack Management (New User Offers)
router.get('/starter-pack', starterPackController.getStarterPackAdmin);
router.put('/starter-pack', starterPackController.updateStarterPackAdmin);
router.post('/starter-pack', starterPackController.updateStarterPackAdmin);

export default router;
