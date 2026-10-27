import { body } from 'express-validator';

export const hiringOtpSendRules = [
  body('channel').isIn(['email', 'mobile']).withMessage('channel must be email or mobile'),
  body('value').trim().notEmpty().withMessage('Email or mobile is required'),
];

export const hiringOtpVerifyRules = [
  ...hiringOtpSendRules,
  body('otp').trim().matches(/^\d{6}$/).withMessage('Enter the 6-digit OTP'),
];

export const hiringVerifyPaymentRules = [
  body('orderId').trim().notEmpty().withMessage('orderId is required'),
  body('paymentId').optional({ values: 'falsy' }).isString(),
  body('signature').optional({ values: 'falsy' }).isString(),
];
