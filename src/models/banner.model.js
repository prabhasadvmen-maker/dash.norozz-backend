import mongoose from 'mongoose';

const bannerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      default: '',
    },
    subtitle: {
      type: String,
      trim: true,
      default: '',
    },
    badgeText: {
      type: String,
      trim: true,
      default: '',
    },
    imageUrl: {
      type: String,
      trim: true,
      default: '',
    },
    gradientBg: {
      type: String,
      default: 'linear-gradient(135deg, #09331E 0%, #064e3b 50%, #0f172a 100%)',
    },
    targetType: {
      type: String,
      enum: ['category', 'service', 'coupon', 'none'],
      default: 'none',
    },
    targetValue: {
      type: String,
      trim: true,
      default: '',
    },
    couponCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

export const Banner = mongoose.model('Banner', bannerSchema);
