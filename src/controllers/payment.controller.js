import { BaseController } from './base.controller.js';
import { paymentService } from '../services/payment.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export class PaymentController extends BaseController {

  createOrder = asyncHandler(async (req, res) => {
    const { amount, type, bookingId } = req.body;
    const order = await paymentService.createGatewayOrder(req.user, amount, type, bookingId);
    return this.sendCreated(res, order, 'Payment Gateway Order created successfully');
  });

  verifyPayment = asyncHandler(async (req, res) => {
    const { transactionId, paymentId, signature } = req.body;
    const result = await paymentService.verifyBookingPayment(req.user, transactionId, paymentId, signature);
    return this.sendSuccess(res, result, result.message);
  });

  walletPay = asyncHandler(async (req, res) => {
    const { bookingId } = req.body;
    const result = await paymentService.processWalletPayment(req.user, bookingId);
    return this.sendSuccess(res, result, result.message);
  });

  processRefund = asyncHandler(async (req, res) => {
    const { reason } = req.body;
    const result = await paymentService.processRefund(req.user, req.params.id, reason);
    return this.sendSuccess(res, result, result.message);
  });

  getTransactionHistory = asyncHandler(async (req, res) => {
    const history = await paymentService.getTransactionHistory(req.user._id, req.query.type);
    return this.sendSuccess(res, history, 'Transaction history retrieved successfully');
  });

  getInvoice = asyncHandler(async (req, res) => {
    const invoice = await paymentService.generateInvoice(req.params.id, req.user);
    return this.sendSuccess(res, invoice, 'Invoice generated successfully');
  });
}

export const paymentController = new PaymentController();
