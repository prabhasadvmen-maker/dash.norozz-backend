import mongoose from 'mongoose';

const supportChatSchema = new mongoose.Schema(
  {
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    sender: {
      type: String,
      enum: ['user', 'agent'],
      required: true,
    },
    agentName: {
      type: String,
      default: 'Neha Sharma',
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    attachment: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

export const SupportChat = mongoose.model('SupportChat', supportChatSchema);
