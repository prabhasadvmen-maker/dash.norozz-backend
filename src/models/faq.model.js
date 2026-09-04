import mongoose from 'mongoose';

const faqSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: [true, 'FAQ Question is required'],
      trim: true,
    },
    answer: {
      type: String,
      required: [true, 'FAQ Answer is required'],
      trim: true,
    },
    targetAudience: {
      type: String,
      enum: ['customer', 'partner', 'both'],
      default: 'both',
      index: true,
    },
    category: {
      type: String,
      default: 'General',
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
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

export const Faq = mongoose.model('Faq', faqSchema);
