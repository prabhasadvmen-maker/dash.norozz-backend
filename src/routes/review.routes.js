import { Router } from 'express';
import { reviewController } from '../controllers/review.controller.js';
import { verifyJWT } from '../middleware/auth.middleware.js';

const router = Router();

// Require Authentication for all review endpoints
router.use(verifyJWT);

// Customer & Partner Rating Endpoints
router.post('/', reviewController.createReview);
router.get('/order/:orderId', reviewController.getOrderReviews);
router.get('/eligibility/:orderId', reviewController.getEligibility);
router.put('/:reviewId', reviewController.editReview);
router.delete('/:reviewId', reviewController.deleteReview);
router.get('/user/:userId', reviewController.getUserReviews);

// Admin Moderation Endpoints
router.get('/admin/list', reviewController.getAdminReviews);
router.patch('/admin/:reviewId/status', reviewController.moderateReviewStatus);

export default router;
