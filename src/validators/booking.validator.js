import { body } from 'express-validator';

export const createBookingRules = [
  body('category').isMongoId().withMessage('Valid Category Mongo ID is required'),
  body('service').isMongoId().withMessage('Valid Service Mongo ID is required'),
  body('packageName').optional().trim(),
  body('addressLine').trim().notEmpty().withMessage('Address Line is required'),
  body('city').optional().trim(),
  body('pincode').optional().trim(),
  body('bookingDate').optional().isISO8601().withMessage('Valid booking date is required'),
  body('timeSlot').trim().notEmpty().withMessage('Time slot is required').isLength({ max: 100 }),
  body('amount').optional().isNumeric(),
  body('paymentMethod').optional().trim(),
];

export const payBookingRules = [
  body('paymentMethod').optional().trim(),
];

export const assignBookingRules = [
  body('partnerId').isMongoId().withMessage('Valid Partner Mongo ID is required'),
];

export const rateBookingRules = [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be an integer between 1 and 5'),
  body('reviewComment').optional().trim(),
];

export const cancelBookingRules = [
  body('reason').optional().trim(),
];
