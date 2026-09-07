import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema(
  {
    bookingId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      required: true,
    },
    package: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServicePackage',
      default: null,
    },
    packageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServicePackage',
      default: null,
      index: true,
    },
    packageName: {
      type: String,
      default: '',
      trim: true,
    },
    packageSnapshot: {
      packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServicePackage', default: null },
      title: { type: String, default: '' },
      price: { type: Number, default: 0 },
      discountType: { type: String, default: 'none' },
      discountValue: { type: Number, default: 0 },
      finalPrice: { type: Number, default: 0 },
      duration: { type: String, default: '45 mins' },
      features: [{ type: String, trim: true }],
    },
    address: {
      title: { type: String, default: 'Home' },
      addressLine: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, default: '' },
      pincode: { type: String, default: '' },
      locationCoordinates: {
        lat: { type: Number, default: null },
        lng: { type: Number, default: null },
      },
    },
    city: {
      type: String,
      required: true,
      default: 'Delhi NCR',
      index: true,
    },
    bookingDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    timeSlot: {
      type: String,
      required: true,
      default: '04:30 PM - 05:30 PM',
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    paymentMethod: {
      type: String,
      default: 'UPI',
    },
    // Dual-Sided Platform Fee & Financial State Snapshot
    financialStatus: {
      type: String,
      enum: [
        'PAYMENT_PENDING',
        'PAYMENT_SUCCESS',
        'PAYMENT_FAILED',
        'AMOUNT_HELD',
        'SERVICE_IN_PROGRESS',
        'SERVICE_COMPLETED',
        'SETTLEMENT_PENDING',
        'SETTLED',
        'REFUND_PENDING',
        'REFUNDED',
        'CANCELLED',
      ],
      default: 'PAYMENT_PENDING',
      index: true,
    },
    financialSnapshot: {
      servicePrice: { type: Number, default: 0 },
      extraServicesPrice: { type: Number, default: 0 },
      customerPlatformFee: { type: Number, default: 0 },
      partnerCommission: { type: Number, default: 0 },
      discountAmount: { type: Number, default: 0 },
      discountBearBy: { type: String, enum: ['CUSTOMER', 'NOROZZ', 'PARTNER', 'SHARED'], default: 'CUSTOMER' },
      customerPayable: { type: Number, default: 0 },
      partnerGrossEarning: { type: Number, default: 0 },
      partnerNetEarning: { type: Number, default: 0 },
      norozzGrossRevenue: { type: Number, default: 0 },
      commissionRuleId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommissionRule', default: null },
      appliedAt: { type: Date, default: Date.now },
    },
    partner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    cancelledByPartners: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    status: {
      type: String,
      enum: [
        'Pending',
        'Assigned',
        'Accepted',
        'On The Way',
        'Started',
        'Completed',
        'Cancelled',
        'Refunded',
      ],
      default: 'Pending',
      index: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    reviewComment: {
      type: String,
      default: '',
      trim: true,
    },
    customerRated: {
      type: Boolean,
      default: false,
    },
    partnerRated: {
      type: Boolean,
      default: false,
    },
    cancellationReason: {
      type: String,
      default: '',
      trim: true,
    },
    cancelledBy: {
      type: String,
      enum: ['customer', 'partner', 'admin', 'system', ''],
      default: '',
    },
    completionOtp: {
      type: String,
      default: () => Math.floor(1000 + Math.random() * 9000).toString(),
    },
    otpVerified: {
      type: Boolean,
      default: false,
    },
    extraServices: [
      {
        serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', default: null },
        packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServicePackage', default: null },
        serviceName: { type: String, required: true },
        packageName: { type: String, default: '' },
        name: { type: String, default: '' },
        price: { type: Number, required: true, min: 0 },
        paymentStatus: { type: String, enum: ['PAID', 'UNPAID'], default: 'UNPAID' },
        paymentTxnId: { type: String, default: '' },
        paidAt: { type: Date, default: null },
        addedAt: { type: Date, default: Date.now },
      },
    ],
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export const Booking = mongoose.model('Booking', bookingSchema);
