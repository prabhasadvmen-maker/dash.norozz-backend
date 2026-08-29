import { Router } from 'express';
import { financialController } from '../controllers/financial.controller.js';
import { verifyJWT } from '../middleware/auth.middleware.js';

const router = Router();

// Require JWT Authentication for all financial routes
router.use(verifyJWT);

// Customer Wallet Routes
router.get('/customer', financialController.getCustomerWallet);

// Partner Wallet & Withdrawal Routes
router.get('/partner', financialController.getPartnerWallet);
router.post('/partner/withdraw', financialController.requestPartnerWithdrawal);

// Admin Financial Summary & Ledger Audit Routes
router.get('/admin/financial-summary', financialController.getAdminFinancialSummary);
router.get('/admin/transactions', financialController.getLedgerTransactions);

// Admin Commission Rules CRUD Routes
router.get('/admin/commission-rules', financialController.getCommissionRules);
router.post('/admin/commission-rules', financialController.createCommissionRule);
router.put('/admin/commission-rules/:id', financialController.updateCommissionRule);

export default router;
