import mongoose from 'mongoose';

const skillSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Skill Name is required'],
      trim: true,
    },
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      default: null,
      index: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
      index: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'deleted'],
      default: 'active',
      index: true,
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

// Compound indices for search
skillSchema.index({ service: 1, name: 1 });
skillSchema.index({ category: 1, name: 1 });

export const Skill = mongoose.model('Skill', skillSchema);
