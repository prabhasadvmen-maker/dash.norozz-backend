import { body } from 'express-validator';

export const createServiceRules = [
  body('name').trim().notEmpty().withMessage('Service Name is required'),
  body('category').isMongoId().withMessage('Valid Parent Category Mongo ID is required'),
  body('subCategory').isMongoId().withMessage('Valid Parent SubCategory Mongo ID is required'),
  body('price').isNumeric().withMessage('Service Price must be a positive number'),
  body('discount').optional().isNumeric().withMessage('Discount must be a number'),
  body('duration').optional().trim(),
  body('thumbnail').optional().trim(),
  body('gallery').optional().isArray().withMessage('Gallery must be an array of image URLs'),
  body('videos').optional().isArray().withMessage('Videos must be an array of video URLs'),
  body('videoUrl').optional().trim(),
  body('cities').optional().isArray().withMessage('Cities must be an array of city names'),
  body('tags').optional().isArray().withMessage('Tags must be an array of strings'),
  body('seoTitle').optional().trim(),
  body('seoDescription').optional().trim(),
  body('seoKeywords').optional().isArray(),
];

export const updateServiceRules = [
  body('name').optional().trim().notEmpty().withMessage('Service Name cannot be empty'),
  body('category').optional().isMongoId().withMessage('Valid Parent Category Mongo ID is required'),
  body('subCategory').optional().isMongoId().withMessage('Valid Parent SubCategory Mongo ID is required'),
  body('price').optional().isNumeric().withMessage('Service Price must be a positive number'),
  body('discount').optional().isNumeric().withMessage('Discount must be a number'),
  body('duration').optional().trim(),
  body('thumbnail').optional().trim(),
  body('gallery').optional().isArray(),
  body('videos').optional().isArray(),
  body('videoUrl').optional().trim(),
  body('cities').optional().isArray(),
  body('tags').optional().isArray(),
  body('seoTitle').optional().trim(),
  body('seoDescription').optional().trim(),
  body('seoKeywords').optional().isArray(),
];

export const updateServiceStatusRules = [
  body('status').isIn(['active', 'inactive', 'deleted']).withMessage('Status must be active, inactive, or deleted'),
];
