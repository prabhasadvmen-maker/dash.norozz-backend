import mongoose from 'mongoose';

const replySchema = new mongoose.Schema({
  message: { type: String, required: true, trim: true },
  senderType: { type: String, enum: ['customer', 'admin'], required: true },
  senderName: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

const ticketSchema = new mongoose.Schema(
  {
    ticketId: { type: String, required: true, unique: true, trim: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    userName: { type: String, default: '', trim: true },
    userPhone: { type: String, default: '', trim: true },
    userEmail: { type: String, default: '', trim: true },
    userType: { type: String, enum: ['customer', 'partner', 'city_admin'], default: 'customer' },
    city: { type: String, default: 'Delhi NCR', trim: true, index: true },
    category: { type: String, default: 'General', trim: true },
    bookingId: { type: String, default: '', trim: true },
    subject: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    priority: { type: String, enum: ['Low', 'Medium', 'High', 'Urgent'], default: 'Medium' },
    status: { type: String, enum: ['Open', 'In Progress', 'Resolved', 'Closed'], default: 'Open', index: true },
    replies: [replySchema],
    adminNote: { type: String, default: '', trim: true },
    resolvedBy: { type: String, default: '', trim: true },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

export const Ticket = mongoose.model('Ticket', ticketSchema);
