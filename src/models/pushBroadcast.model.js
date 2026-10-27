import mongoose from 'mongoose';

// Audit trail of every broadcast an admin sent
const pushBroadcastSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: '' },
    link: { type: String, default: '' },
    audience: { type: String, enum: ['all', 'customers', 'partners'], default: 'all' },
    total: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    delivered: { type: Boolean, default: true },
    // Why individual devices failed, e.g. [{ code: 'messaging/invalid-argument', count: 2 }]
    failureReasons: { type: [{ _id: false, code: String, count: Number }], default: [] },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    sentByName: { type: String, default: '' },
  },
  { timestamps: true }
);

export const PushBroadcast = mongoose.model('PushBroadcast', pushBroadcastSchema);
