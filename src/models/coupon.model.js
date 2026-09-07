import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    applicableCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null, // null means promo works on ALL categories / services
    },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      default: 'fixed',
    },
    discountValue: {
      type: Number,
      required: true,
    },
    maxDiscountAmount: {
      type: Number,
      default: null,
    },
    minBookingAmount: {
      type: Number,
      default: 0,
    },
    usageLimitPerUser: {
      type: Number,
      default: 1, // Default: Each customer can use code max 1 time
    },
    validFrom: {
      type: Date,
      default: Date.now,
    },
    validUntil: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    usedBy: [
      {
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        usedAt: { type: Date, default: Date.now },
        bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
      },
    ],
  },
  {
    timestamps: true,
  }
);

export const Coupon = mongoose.model('Coupon', couponSchema);
