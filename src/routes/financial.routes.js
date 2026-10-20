import { Router } from 'express';
import { financialController } from '../controllers/financial.controller.js';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';
import { ROLES } from '../constants/roles.constant.js';

const router = Router();

// Require JWT Authentication for all financial routes
router.use(verifyJWT);

// Customer Wallet Routes
router.get('/customer', authorizeRoles(ROLES.CUSTOMER), financialController.getCustomerWallet);

// Partner Wallet & Withdrawal Routes
router.get('/partner', authorizeRoles(ROLES.PARTNER), financialController.getPartnerWallet);
router.post('/partner/withdraw', authorizeRoles(ROLES.PARTNER), financialController.requestPartnerWithdrawal);

// Admin Financial Summary & Ledger Audit Routes
router.get('/admin/financial-summary', authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN), financialController.getAdminFinancialSummary);
router.get('/admin/transactions', authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN), financialController.getLedgerTransactions);

// Admin Commission Rules CRUD Routes (platform money rules: super admin only for writes)
router.get('/admin/commission-rules', authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN), financialController.getCommissionRules);
router.post('/admin/commission-rules', authorizeRoles(ROLES.SUPER_ADMIN), financialController.createCommissionRule);
router.put('/admin/commission-rules/:id', authorizeRoles(ROLES.SUPER_ADMIN), financialController.updateCommissionRule);

export default router;
