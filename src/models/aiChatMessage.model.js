import mongoose from 'mongoose';

const aiChatMessageSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    modelUsed: {
      type: String,
      default: 'norozz-ai',
    },
  },
  {
    timestamps: true,
  }
);

aiChatMessageSchema.index({ user: 1, createdAt: 1 });

export const AiChatMessage = mongoose.model('AiChatMessage', aiChatMessageSchema);
