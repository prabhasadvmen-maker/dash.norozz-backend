import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema(
  {
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Parent Category ID is required'],
      index: true,
    },
    subCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubCategory',
      required: [true, 'Parent SubCategory ID is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Service Name is required'],
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    duration: {
      type: String,
      default: '45 mins',
      trim: true,
    },
    price: {
      type: Number,
      default: 0,
      min: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    finalPrice: {
      type: Number,
      default: 0,
    },
    thumbnail: {
      type: String,
      default: '',
    },
    gallery: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'deleted'],
      default: 'active',
    },
    cities: {
      type: [String],
      default: ['Delhi NCR'],
    },
    tags: {
      type: [String],
      default: [],
    },
    seoTitle: {
      type: String,
      default: '',
      trim: true,
    },
    seoDescription: {
      type: String,
      default: '',
      trim: true,
    },
    seoKeywords: {
      type: [String],
      default: [],
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

/**
 * Pre-validate middleware to generate slug & calculate finalPrice
 */
serviceSchema.pre('validate', function (next) {
  if (this.name && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9 -]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  if (this.price !== undefined) {
    const discountAmt = this.discount || 0;
    this.finalPrice = Math.max(0, this.price - discountAmt);
  }

  next();
});

export const Service = mongoose.model('Service', serviceSchema);
