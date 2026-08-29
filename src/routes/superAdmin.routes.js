import { Router } from 'express';
import { superAdminController } from '../controllers/superAdmin.controller.js';
import {
  createCityAdminRules,
  updateCityAdminRules,
  resetCityAdminPasswordRules,
  updateCityAdminStatusRules,
} from '../validators/superAdmin.validator.js';
import { validate } from '../validators/index.js';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';
import { ROLES } from '../constants/roles.constant.js';

const router = Router();

// Protect ALL Super Admin endpoints with JWT + SuperAdmin RBAC
router.use(verifyJWT);
router.use(authorizeRoles(ROLES.SUPER_ADMIN));

// Dashboard Statistics & Analytics
router.get('/dashboard', superAdminController.getDashboard);

// City Admin Management (CRUD)
router.get('/city-admins', superAdminController.getCityAdmins);
router.post('/city-admins', createCityAdminRules, validate, superAdminController.createCityAdmin);
router.put('/city-admins/:id', updateCityAdminRules, validate, superAdminController.updateCityAdmin);
router.delete('/city-admins/:id', superAdminController.deleteCityAdmin);
router.patch('/city-admins/:id/status', updateCityAdminStatusRules, validate, superAdminController.suspendCityAdmin);
router.patch('/city-admins/:id/reset-password', resetCityAdminPasswordRules, validate, superAdminController.resetCityAdminPassword);
router.post('/city-admins/:id/impersonate', superAdminController.impersonateCityAdmin);

// Master Platform Directories
router.get('/customers', superAdminController.getCustomers);
router.get('/partners', superAdminController.getPartners);
router.get('/bookings', superAdminController.getBookings);

// Global Referral Bonus Settings
router.get('/referral-settings', superAdminController.getReferralSettings);
router.put('/referral-settings', superAdminController.updateReferralSettings);

// Coupon Management CRUD
router.get('/coupons', superAdminController.getCoupons);
router.post('/coupons', superAdminController.createCoupon);
router.put('/coupons/:id', superAdminController.updateCoupon);
router.delete('/coupons/:id', superAdminController.deleteCoupon);

export default router;
