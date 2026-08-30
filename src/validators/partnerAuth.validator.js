import { body } from 'express-validator';

export const partnerSignupRules = [
  body('name').trim().notEmpty().withMessage('Technician Full Name is required'),
  body('email').isEmail().withMessage('Valid email address is required'),
  body('phone').trim().notEmpty().withMessage('Mobile phone number is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('agencyName').optional().trim(),
  body('category').optional().trim(),
  body('city').optional().trim(),
];

export const partnerLoginRules = [
  body('email').isEmail().withMessage('Valid email address is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

export const partnerForgotPasswordRules = [
  body('email').isEmail().withMessage('Valid email address is required'),
];

export const partnerResetPasswordRules = [
  body('email').isEmail().withMessage('Valid email address is required'),
  body('otp').isLength({ min: 4, max: 6 }).withMessage('Valid 4-6 digit OTP code is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
];

export const partnerOtpRequestRules = [
  body('phone').trim().notEmpty().withMessage('Mobile phone number is required'),
];

export const partnerOtpVerifyRules = [
  body('phone').trim().notEmpty().withMessage('Mobile phone number is required'),
  body('otp').isLength({ min: 4, max: 6 }).withMessage('Valid 4-6 digit OTP code is required'),
];

export const updatePartnerProfileRules = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('dob').optional().trim(),
  body('gender').optional().trim(),
  body('assignedCity').optional().trim(),
  body('category').optional().trim(),
];

export const onboardingDocumentsRules = [
  body('documents').optional().isObject().withMessage('Documents must be an object'),
];

export const onboardingCategoryRules = [
  body().custom((value, { req }) => {
    const cat = req.body?.category || req.body?.categories;
    if (!cat || (Array.isArray(cat) && cat.length === 0)) {
      throw new Error('Service category is required');
    }
    return true;
  }),
];

export const onboardingSkillsRules = [
  body('experience').optional().trim(),
  body('skills').optional().isArray().withMessage('Skills must be an array'),
];

export const onboardingServiceAreaRules = [
  body('workRadius').optional().isNumeric().withMessage('Work radius must be a number'),
  body('localities').optional().isArray().withMessage('Localities must be an array'),
];

export const onboardingWorkingHoursRules = [
  body('workingHours').optional().isArray().withMessage('Working hours schedule must be an array'),
];


