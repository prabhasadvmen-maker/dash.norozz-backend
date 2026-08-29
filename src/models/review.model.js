import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    reviewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    reviewerRole: {
      type: String,
      enum: ['CUSTOMER', 'PARTNER'],
      required: true,
    },
    revieweeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    revieweeRole: {
      type: String,
      enum: ['CUSTOMER', 'PARTNER'],
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer rating. Only integer ratings 1, 2, 3, 4, 5 are allowed.',
      },
    },
    comment: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: ['PUBLISHED', 'HIDDEN', 'FLAGGED', 'DELETED'],
      default: 'PUBLISHED',
      index: true,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Enforce strictly 1 review per reviewer per order per reviewee at database level
reviewSchema.index({ orderId: 1, reviewerId: 1, revieweeId: 1 }, { unique: true });

export const Review = mongoose.model('Review', reviewSchema);
