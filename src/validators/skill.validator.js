import { body, param } from 'express-validator';

export const createSkillRules = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Skill Name is required'),
  body('service')
    .optional()
    .isMongoId()
    .withMessage('Invalid Service ID format'),
  body('category')
    .optional()
    .isMongoId()
    .withMessage('Invalid Category ID format'),
];

export const updateSkillRules = [
  param('id')
    .isMongoId()
    .withMessage('Invalid Skill ID format'),
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Skill Name cannot be empty'),
  body('service')
    .optional()
    .isMongoId()
    .withMessage('Invalid Service ID format'),
  body('category')
    .optional()
    .isMongoId()
    .withMessage('Invalid Category ID format'),
];
