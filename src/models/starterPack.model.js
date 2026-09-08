import mongoose from 'mongoose';

const starterPackSchema = new mongoose.Schema(
  {
    badge: {
      type: String,
      default: 'STARTER PACK',
      trim: true,
    },
    subBadge: {
      type: String,
      default: '✦ ONE TIME OFFER ✦',
      trim: true,
    },
    title: {
      type: String,
      default: '2 VISITS FOR ₹398 ₹139',
      trim: true,
    },
    originalPrice: {
      type: Number,
      default: 398,
    },
    offerPrice: {
      type: Number,
      default: 139,
    },
    ticketOriginalPrice: {
      type: Number,
      default: 199,
    },
    ticketOfferPrice: {
      type: Number,
      default: 70,
    },
    perVisitPriceText: {
      type: String,
      default: 'Only ₹70 per visit',
      trim: true,
    },
    visitCount: {
      type: Number,
      default: 2,
    },
    visitDurationMinutes: {
      type: Number,
      default: 60,
    },
    validityDays: {
      type: Number,
      default: 15,
    },
    bannerColor: {
      type: String,
      default: '#ec4899',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    targetAudience: {
      type: String,
      enum: ['NEW_USERS_ONLY', 'ALL_USERS'],
      default: 'NEW_USERS_ONLY',
    },
    applicableCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    applicableService: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      default: null,
    },
    benefits: {
      type: [String],
      default: [
        '2 × 60 min Professional Doorstep Visits',
        'Valid for 15 Days after purchase',
        'Covers standard labor & technician inspection fee',
        '100% Satisfaction Guarantee or free re-visit',
      ],
    },
    claimedUsers: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        claimedAt: { type: Date, default: Date.now },
        bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
      },
    ],
  },
  {
    timestamps: true,
  }
);

export const StarterPack = mongoose.model('StarterPack', starterPackSchema);
