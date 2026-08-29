import { body } from 'express-validator';

export const customerSignupRules = [
  body('name').trim().notEmpty().withMessage('Full Name is required'),
  body('email').isEmail().withMessage('Valid email address is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('phone').optional().trim(),
];

export const customerLoginRules = [
  body('email').isEmail().withMessage('Valid email address is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

export const otpLoginRequestRules = [
  body('emailOrPhone').trim().notEmpty().withMessage('Email address or phone number is required'),
];

export const otpLoginVerifyRules = [
  body('emailOrPhone').trim().notEmpty().withMessage('Email address or phone number is required'),
  body('otp').isLength({ min: 4, max: 6 }).withMessage('Valid 4-6 digit OTP code is required'),
];

export const customerForgotPasswordRules = [
  body('email').isEmail().withMessage('Valid email address is required'),
];

export const customerResetPasswordRules = [
  body('email').isEmail().withMessage('Valid email address is required'),
  body('otp').isLength({ min: 4, max: 6 }).withMessage('Valid 4-6 digit OTP code is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
];

export const updateCustomerProfileRules = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('email').optional().isEmail().withMessage('Valid email address is required'),
  body('phone').optional().trim(),
  body('dob').optional().trim(),
  body('gender').optional().trim(),
  body('profileImage').optional().trim(),
  body('city').optional().trim(),
  body('state').optional().trim(),
  body('country').optional().trim(),
  body('address').optional().trim(),
];

export const addAddressRules = [
  body('addressLine').optional().trim(),
  body('street').optional().trim(),
  body('address').optional().trim(),
  body('city').optional().trim(),
  body('title').optional().trim(),
  body('state').optional().trim(),
  body('pincode').optional().trim(),
  body('zipCode').optional().trim(),
  body('isDefault').optional(),
];

export const updateAddressRules = [
  body('addressLine').optional().trim(),
  body('street').optional().trim(),
  body('address').optional().trim(),
  body('city').optional().trim(),
  body('title').optional().trim(),
  body('state').optional().trim(),
  body('pincode').optional().trim(),
  body('zipCode').optional().trim(),
  body('isDefault').optional(),
];
