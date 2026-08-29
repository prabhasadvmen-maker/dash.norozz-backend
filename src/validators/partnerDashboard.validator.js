import { body } from 'express-validator';

export const updateProfileRules = [
  body('name').optional().trim().notEmpty().withMessage('Contact Name cannot be empty'),
  body('agencyName').optional().trim().notEmpty().withMessage('Agency Name cannot be empty'),
  body('address').optional().trim(),
];

export const updateAvailabilityRules = [
  body('isOnline').optional().isBoolean().withMessage('isOnline must be a boolean value'),
  body('workingHours').optional().trim(),
];
