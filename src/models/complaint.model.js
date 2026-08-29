import mongoose from 'mongoose';

const complaintSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    complaintType: {
      type: String,
      required: true,
      enum: ['Payment Delay / Issue', 'Job Cancellation Issue', 'Customer Misbehavior', 'App Bug / Technical Issue', 'Other'],
      default: 'Payment Delay / Issue',
    },
    bookingId: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    screenshot: {
      type: String,
      default: '',
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High'],
      default: 'Medium',
    },
    status: {
      type: String,
      enum: ['Open', 'In Progress', 'Resolved', 'Closed'],
      default: 'Open',
    },
  },
  { timestamps: true }
);

export const Complaint = mongoose.model('Complaint', complaintSchema);
