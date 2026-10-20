import { Router } from 'express';
import { paymentController } from '../controllers/payment.controller.js';
import {
  createGatewayOrderRules,
  verifyPaymentRules,
  walletPayRules,
  refundRules,
} from '../validators/payment.validator.js';
import { validate } from '../validators/index.js';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';
import { ROLES } from '../constants/roles.constant.js';

const router = Router();

// Protect ALL Payment endpoints with JWT
router.use(verifyJWT);

router.post('/create-order', createGatewayOrderRules, validate, paymentController.createOrder);
router.post('/verify', verifyPaymentRules, validate, paymentController.verifyPayment);
router.post('/wallet-pay', authorizeRoles(ROLES.CUSTOMER), walletPayRules, validate, paymentController.walletPay);
router.post('/:id/refund', authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CITY_ADMIN), refundRules, validate, paymentController.processRefund);
router.get('/history', paymentController.getTransactionHistory);
router.get('/:id/invoice', paymentController.getInvoice);

export default router;
