import mongoose from 'mongoose';

const servicePackageSchema = new mongoose.Schema(
  {
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      required: [true, 'Parent Service ID is required'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Package title is required'],
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    price: {
      type: Number,
      required: [true, 'Package base price is required'],
      min: [0, 'Price cannot be negative'],
    },
    discountType: {
      type: String,
      enum: ['none', 'fixed', 'percentage'],
      default: 'none',
    },
    discountValue: {
      type: Number,
      default: 0,
      min: [0, 'Discount cannot be negative'],
    },
    finalPrice: {
      type: Number,
      required: true,
      min: [0, 'Final price cannot be negative'],
    },
    duration: {
      type: String,
      default: '45 mins',
      trim: true,
    },
    features: {
      type: [String],
      default: [],
    },
    isPopular: {
      type: Boolean,
      default: false,
    },
    isRecommended: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'deleted'],
      default: 'active',
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound Index for fast lookup & sorting per service
servicePackageSchema.index({ service: 1, status: 1, sortOrder: 1 });

/**
 * Pre-validate middleware for slug generation & server-side finalPrice calculation
 */
servicePackageSchema.pre('validate', function (next) {
  if (this.title && !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9 -]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  // Calculate finalPrice
  const basePrice = this.price || 0;
  const discVal = this.discountValue || 0;

  if (this.discountType === 'none' || !this.discountType) {
    this.finalPrice = Math.max(0, basePrice);
  } else if (this.discountType === 'fixed') {
    this.finalPrice = Math.max(0, basePrice - discVal);
  } else if (this.discountType === 'percentage') {
    const effectivePercentage = Math.min(100, Math.max(0, discVal));
    this.finalPrice = Math.max(0, Math.round(basePrice * (1 - effectivePercentage / 100)));
  } else {
    this.finalPrice = Math.max(0, basePrice);
  }

  next();
});

export const ServicePackage = mongoose.model('ServicePackage', servicePackageSchema);
