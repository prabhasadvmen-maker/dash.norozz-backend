import { body } from 'express-validator';

export const createGatewayOrderRules = [
  body('amount').optional().isNumeric().withMessage('Amount must be a positive number'),
  body('bookingId').optional().isMongoId().withMessage('Valid Booking Mongo ID is required'),
  body('type').optional().isIn(['booking_payment', 'wallet_recharge']).withMessage('Invalid payment type'),
];

export const verifyPaymentRules = [
  body('transactionId').trim().notEmpty().withMessage('Transaction ID is required'),
  body('paymentId').optional().trim(),
  body('signature').optional().trim(),
];

export const walletPayRules = [
  body('bookingId').isMongoId().withMessage('Valid Booking Mongo ID is required'),
  body('amount').optional().isNumeric(),
];

export const refundRules = [
  body('reason').optional().trim(),
];
