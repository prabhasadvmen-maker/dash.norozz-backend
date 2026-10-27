import mongoose from 'mongoose';
import { Review } from '../models/review.model.js';
import { Booking } from '../models/booking.model.js';
import { User } from '../models/user.model.js';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { notificationService } from './notificationService.js';
import { escapeRegex } from './cityPayments.service.js';

export class ReviewService {
  /**
   * Helper: Sanitize Comment against basic XSS / HTML tags
   */
  sanitizeComment(text = '') {
    return String(text)
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .trim();
  }

  /**
   * 1. CREATE TWO-WAY REVIEW (Customer -> Partner OR Partner -> Customer)
   */
  async createReview(reviewerUser, { orderId, rating, comment = '' }) {
    // 1. Validate Rating Integer Rule
    const numRating = Number(rating);
    if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        'Invalid rating value. Rating must be an integer between 1 and 5 (Allowed: 1, 2, 3, 4, 5).'
      );
    }

    // 2. Validate Comment Length Rule (0 to 1000 characters)
    const sanitizedComment = this.sanitizeComment(comment);
    if (sanitizedComment.length > 1000) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Review comment exceeds maximum limit of 1000 characters.');
    }

    // 3. Find Order / Booking & Validate Status
    const booking = await Booking.findById(orderId);
    if (!booking) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Booking order not found.');
    }

    if (booking.status !== 'Completed') {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        `Ratings can only be submitted for completed orders. Current order status: '${booking.status}'.`
      );
    }

    // 4. Determine Participant Ownership & Roles
    const reviewerIdStr = String(reviewerUser._id);
    const customerIdStr = String(booking.customer);
    const partnerIdStr = String(booking.partner || '');

    let reviewerRole = '';
    let revieweeId = null;
    let revieweeRole = '';

    if (reviewerIdStr === customerIdStr) {
      reviewerRole = 'CUSTOMER';
      revieweeId = booking.partner;
      revieweeRole = 'PARTNER';
      if (!revieweeId) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Cannot review an order that has no assigned service partner.');
      }
    } else if (reviewerIdStr === partnerIdStr) {
      reviewerRole = 'PARTNER';
      revieweeId = booking.customer;
      revieweeRole = 'CUSTOMER';
    } else {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        'Unauthorized: You are not a participant (Customer or Partner) of this completed order.'
      );
    }

    // 5. Create Review with Compound Unique Index Guard
    let review;
    try {
      review = await Review.create({
        orderId: booking._id,
        reviewerId: reviewerUser._id,
        reviewerRole,
        revieweeId,
        revieweeRole,
        rating: numRating,
        comment: sanitizedComment,
        status: 'PUBLISHED',
      });
    } catch (dbErr) {
      if (dbErr.code === 11000) {
        throw new ApiError(
          HTTP_STATUS.CONFLICT,
          'Duplicate Submission: You have already submitted a rating & review for this completed order.'
        );
      }
      throw dbErr;
    }

    // 6. Update Booking Flags
    if (reviewerRole === 'CUSTOMER') {
      booking.customerRated = true;
      booking.rating = numRating;
      booking.reviewComment = sanitizedComment;
    } else {
      booking.partnerRated = true;
    }
    await booking.save();

    // 7. Atomic Recalculation of Rating Statistics on User / Partner Document
    await this.recalculateUserRatingStats(revieweeId);

    // 8. Trigger Real-Time Notification Log
    const revieweeUser = await User.findById(revieweeId).select('name email phone');
    if (revieweeUser) {
      const msg = `${reviewerUser.name || 'User'} rated your service ${numRating} ⭐ stars: "${sanitizedComment.substring(0, 40)}${sanitizedComment.length > 40 ? '...' : ''}"`;
      console.log(`🔔 NOTIFICATION LOG: Review Alert sent to ${revieweeRole} (${revieweeUser.name}): ${msg}`);
      notificationService.dispatchOtp(revieweeUser.email || revieweeUser.phone || '', msg).catch(() => {});
    }

    return {
      message: '🎉 Thank you! Your rating & review has been submitted successfully.',
      review,
    };
  }

  /**
   * 2. GET ORDER REVIEWS (Returns customer & partner reviews for a completed order)
   */
  async getOrderReviews(orderId) {
    const reviews = await Review.find({
      orderId,
      status: 'PUBLISHED',
      isDeleted: false,
    }).populate('reviewerId', 'name profileImage avatar role');

    const customerReview = reviews.find((r) => r.reviewerRole === 'CUSTOMER') || null;
    const partnerReview = reviews.find((r) => r.reviewerRole === 'PARTNER') || null;

    return { customerReview, partnerReview };
  }

  /**
   * 3. CHECK REVIEW ELIGIBILITY FOR A USER & ORDER
   */
  async getEligibility(user, orderId) {
    const booking = await Booking.findById(orderId);
    if (!booking) {
      return { eligible: false, reason: 'Booking order not found', canReview: false };
    }

    if (booking.status !== 'Completed') {
      return {
        eligible: false,
        reason: `Order is not completed yet (Current status: '${booking.status}')`,
        canReview: false,
      };
    }

    const userIdStr = String(user._id);
    const customerIdStr = String(booking.customer);
    const partnerIdStr = String(booking.partner || '');

    const isCustomer = userIdStr === customerIdStr;
    const isPartner = userIdStr === partnerIdStr;

    if (!isCustomer && !isPartner) {
      return {
        eligible: false,
        reason: 'You are not a participant of this order',
        canReview: false,
      };
    }

    const existingReview = await Review.findOne({
      orderId: booking._id,
      reviewerId: user._id,
      isDeleted: false,
    });

    return {
      eligible: true,
      canReview: !existingReview,
      alreadyReviewed: Boolean(existingReview),
      reviewerRole: isCustomer ? 'CUSTOMER' : 'PARTNER',
      existingReview,
    };
  }

  /**
   * 4. EDIT USER'S OWN REVIEW
   */
  async editReview(user, reviewId, { rating, comment = '' }) {
    const review = await Review.findById(reviewId);
    if (!review || review.isDeleted) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Review not found');
    }

    if (String(review.reviewerId) !== String(user._id)) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Unauthorized: You can only edit your own review');
    }

    const numRating = Number(rating);
    if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid rating value. Must be an integer 1-5.');
    }

    review.rating = numRating;
    review.comment = this.sanitizeComment(comment);
    review.isEdited = true;
    await review.save();

    await this.recalculateUserRatingStats(review.revieweeId);

    return {
      message: 'Review updated successfully',
      review,
    };
  }

  /**
   * 5. SOFT-DELETE REVIEW
   */
  async softDeleteReview(userOrAdmin, reviewId) {
    const review = await Review.findById(reviewId);
    if (!review || review.isDeleted) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Review not found');
    }

    const isOwner = String(review.reviewerId) === String(userOrAdmin._id);
    const isAdmin = ['super_admin', 'city_admin'].includes(userOrAdmin.role);

    if (!isOwner && !isAdmin) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Unauthorized to delete this review');
    }

    review.isDeleted = true;
    review.status = 'DELETED';
    await review.save();

    await this.recalculateUserRatingStats(review.revieweeId);

    return { message: 'Review deleted successfully' };
  }

  /**
   * 6. GET REVIEWS FOR A USER / PARTNER PROFILE (WITH STAR BREAKDOWN)
   */
  async getUserReviews(userId, { page = 1, limit = 20, ratingFilter = null }) {
    const user = await User.findById(userId).select(
      'name agencyName role averageRating totalRatings ratingBreakdown'
    );
    if (!user) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'User not found');

    const filter = {
      revieweeId: userId,
      status: 'PUBLISHED',
      isDeleted: false,
    };

    if (ratingFilter && [1, 2, 3, 4, 5].includes(Number(ratingFilter))) {
      filter.rating = Number(ratingFilter);
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);

    const reviews = await Review.find(filter)
      .populate('reviewerId', 'name agencyName profileImage avatar role')
      .populate('orderId', 'bookingId packageName amount bookingDate')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const total = await Review.countDocuments(filter);

    return {
      userSummary: {
        userId: user._id,
        name: user.name,
        role: user.role,
        averageRating: user.averageRating || 5.0,
        totalRatings: user.totalRatings || 0,
        ratingBreakdown: user.ratingBreakdown || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      },
      reviews,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  /**
   * 7. GET ADMIN REVIEWS MODERATION LIST
   */
  async getAdminReviews({ page = 1, limit = 20, status = null, search = '', rating = null, reviewerRole = null }) {
    const filter = { isDeleted: false };
    if (status) filter.status = String(status).toUpperCase();
    if (rating && Number.isInteger(Number(rating))) filter.rating = Number(rating);
    if (reviewerRole) filter.reviewerRole = String(reviewerRole).toUpperCase();

    const term = String(search || '').trim().slice(0, 60);
    if (term) {
      const re = new RegExp(escapeRegex(term), 'i');
      const people = await User.find({ $or: [{ name: re }, { email: re }, { agencyName: re }] }).select('_id').limit(200).lean();
      const ids = people.map((u) => u._id);
      filter.$or = [{ comment: re }, { reviewerId: { $in: ids } }, { revieweeId: { $in: ids } }];
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate('reviewerId', 'name email role phone agencyName')
        .populate('revieweeId', 'name email role phone agencyName')
        .populate('orderId', 'bookingId amount status packageName')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      Review.countDocuments(filter),
    ]);

    return {
      reviews,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.max(1, Math.ceil(total / limitNum)) },
    };
  }

  /** Platform-wide numbers for the moderation page; the average only counts published reviews. */
  async getAdminReviewSummary() {
    const [rows] = await Review.aggregate([
      { $match: { isDeleted: false } },
      {
        $facet: {
          byStatus: [{ $group: { _id: '$status', n: { $sum: 1 } } }],
          published: [
            { $match: { status: 'PUBLISHED' } },
            { $group: { _id: '$rating', n: { $sum: 1 } } },
          ],
        },
      },
    ]);
    const status = Object.fromEntries((rows?.byStatus || []).map((r) => [r._id, r.n]));
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of rows?.published || []) dist[r._id] = r.n;
    const publishedCount = Object.values(dist).reduce((a, b) => a + b, 0);
    const weighted = Object.entries(dist).reduce((sum, [star, n]) => sum + Number(star) * n, 0);
    return {
      total: Object.values(status).reduce((a, b) => a + b, 0),
      published: status.PUBLISHED || 0,
      flagged: status.FLAGGED || 0,
      hidden: status.HIDDEN || 0,
      averageRating: publishedCount ? Math.round((weighted / publishedCount) * 10) / 10 : null,
      distribution: dist,
    };
  }

  /**
   * 8. ADMIN MODERATE REVIEW STATUS (PUBLISHED, HIDDEN, FLAGGED, DELETED)
   */
  async moderateReviewStatus(reviewId, status) {
    const validStatuses = ['PUBLISHED', 'HIDDEN', 'FLAGGED', 'DELETED'];
    if (!validStatuses.includes(status)) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const review = await Review.findById(reviewId);
    if (!review) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Review not found');

    review.status = status;
    if (status === 'DELETED') review.isDeleted = true;
    await review.save();

    await this.recalculateUserRatingStats(review.revieweeId);

    return { message: `Review status updated to '${status}'`, review };
  }

  /**
   * 9. ATOMIC RATING STATISTICS RECALCULATION
   * Computes average rating & 1-5 star distribution counts for a user
   */
  async recalculateUserRatingStats(userId) {
    const stats = await Review.aggregate([
      {
        $match: {
          revieweeId: new mongoose.Types.ObjectId(userId),
          status: 'PUBLISHED',
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: null,
          totalRatings: { $sum: 1 },
          averageRating: { $avg: '$rating' },
          count5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
          count4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
          count3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
          count2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
          count1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
        },
      },
    ]);

    let totalRatings = 0;
    let averageRating = 5.0;
    let ratingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    if (stats.length > 0) {
      totalRatings = stats[0].totalRatings || 0;
      averageRating = Math.round((stats[0].averageRating || 5.0) * 10) / 10;
      ratingBreakdown = {
        1: stats[0].count1 || 0,
        2: stats[0].count2 || 0,
        3: stats[0].count3 || 0,
        4: stats[0].count4 || 0,
        5: stats[0].count5 || 0,
      };
    }

    await User.findByIdAndUpdate(userId, {
      averageRating,
      totalRatings,
      ratingBreakdown,
    });

    return { averageRating, totalRatings, ratingBreakdown };
  }
}

export const reviewService = new ReviewService();
