import { reviewService } from '../services/review.service.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

export class ReviewController {
  // 1. Submit Rating & Review (POST /api/reviews)
  async createReview(req, res, next) {
    try {
      const { orderId, rating, comment } = req.body;
      const result = await reviewService.createReview(req.user, { orderId, rating, comment });
      res.status(HTTP_STATUS.CREATED).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  // 2. Get Order Reviews (GET /api/reviews/order/:orderId)
  async getOrderReviews(req, res, next) {
    try {
      const { orderId } = req.params;
      const data = await reviewService.getOrderReviews(orderId);
      res.status(HTTP_STATUS.OK).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // 3. Get User Eligibility to Review Order (GET /api/reviews/eligibility/:orderId)
  async getEligibility(req, res, next) {
    try {
      const { orderId } = req.params;
      const data = await reviewService.getEligibility(req.user, orderId);
      res.status(HTTP_STATUS.OK).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // 4. Edit Review (PUT /api/reviews/:reviewId)
  async editReview(req, res, next) {
    try {
      const { reviewId } = req.params;
      const { rating, comment } = req.body;
      const result = await reviewService.editReview(req.user, reviewId, { rating, comment });
      res.status(HTTP_STATUS.OK).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  // 5. Delete Review (DELETE /api/reviews/:reviewId)
  async deleteReview(req, res, next) {
    try {
      const { reviewId } = req.params;
      const result = await reviewService.softDeleteReview(req.user, reviewId);
      res.status(HTTP_STATUS.OK).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  // 6. Get User Reviews & Rating Breakdown (GET /api/reviews/user/:userId)
  async getUserReviews(req, res, next) {
    try {
      const { userId } = req.params;
      const { page, limit, rating } = req.query;
      const data = await reviewService.getUserReviews(userId, { page, limit, ratingFilter: rating });
      res.status(HTTP_STATUS.OK).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // 7. Get Admin Reviews Moderation List (GET /api/admin/reviews)
  async getAdminReviews(req, res, next) {
    try {
      const { page, limit, status, search, rating, reviewerRole } = req.query;
      const data = await reviewService.getAdminReviews({ page, limit, status, search, rating, reviewerRole });
      res.status(HTTP_STATUS.OK).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getAdminReviewSummary(req, res, next) {
    try {
      const data = await reviewService.getAdminReviewSummary();
      res.status(HTTP_STATUS.OK).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // 8. Admin Moderate Review Status (PATCH /api/admin/reviews/:reviewId/status)
  async moderateReviewStatus(req, res, next) {
    try {
      const { reviewId } = req.params;
      const { status } = req.body;
      const result = await reviewService.moderateReviewStatus(reviewId, status);
      res.status(HTTP_STATUS.OK).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
}

export const reviewController = new ReviewController();
