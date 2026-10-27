import mongoose from 'mongoose';

// One row per browser/device that agreed to receive push notifications
const pushTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    role: { type: String, default: '', index: true },
    userAgent: { type: String, default: '' },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const PushToken = mongoose.model('PushToken', pushTokenSchema);
