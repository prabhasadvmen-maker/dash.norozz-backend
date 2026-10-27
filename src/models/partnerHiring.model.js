import mongoose from 'mongoose';

export const HIRING_CATEGORIES = ['Driver Care', 'Nanny Care', 'Baby Care', 'Personal Care'];
export const HIRING_WORK_TYPES = ['Full-time', 'Part-time', 'Live-in'];
export const HIRING_ID_TYPES = ['Aadhaar Card', 'PAN Card', 'Voter ID', 'Passport'];
export const HIRING_REVIEW_STATUSES = ['Pending', 'Under Review', 'Approved', 'Rejected'];

const addressSchema = new mongoose.Schema(
  {
    house: { type: String, trim: true, required: true },
    street: { type: String, trim: true, required: true },
    city: { type: String, trim: true, required: true },
    state: { type: String, trim: true, required: true },
    pin: { type: String, trim: true, required: true },
  },
  { _id: false }
);

const fileSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    key: { type: String },
    name: { type: String },
    mimeType: { type: String },
  },
  { _id: false }
);

const partnerHiringSchema = new mongoose.Schema(
  {
    // 1. Personal
    fullName: { type: String, required: true, trim: true },
    mobile: { type: String, required: true, trim: true, index: true },
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    isMobileVerified: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: false },
    dob: { type: Date, required: true },
    gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
    profilePhoto: { type: fileSchema, required: true },

    // 2. Address
    currentAddress: { type: addressSchema, required: true },
    permanentSameAsCurrent: { type: Boolean, default: true },
    permanentAddress: { type: addressSchema, required: true },

    // 3. Service
    serviceCategory: { type: String, enum: HIRING_CATEGORIES, required: true, index: true },
    experienceYears: { type: Number, required: true, min: 0, max: 60 },
    skills: { type: [String], default: [] },
    preferredWorkType: { type: String, enum: HIRING_WORK_TYPES, required: true },

    // 4. Documents
    identityProofType: { type: String, enum: HIRING_ID_TYPES, required: true },
    identityProof: { type: fileSchema, required: true },
    addressProof: { type: fileSchema, required: true },
    drivingLicence: { type: fileSchema },

    // 5. Consent
    consent: {
      termsAccepted: { type: Boolean, default: false },
      privacyAccepted: { type: Boolean, default: false },
      refundPolicyAccepted: { type: Boolean, default: false },
      acceptedAt: { type: Date },
      ip: { type: String },
    },

    // 6. Payment
    registrationFee: { type: Number, default: 499 },
    paymentMethod: { type: String, trim: true },
    paymentStatus: { type: String, enum: ['Pending', 'Paid', 'Failed'], default: 'Pending', index: true },
    paymentOrderId: { type: String },
    paymentId: { type: String },
    paidAt: { type: Date },
    receiptNumber: { type: String, unique: true, sparse: true },

    // Review workflow (Super Admin)
    reviewStatus: { type: String, enum: HIRING_REVIEW_STATUSES, default: 'Pending', index: true },
    reviewRemarks: { type: String, trim: true, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

export const PartnerHiring = mongoose.model('PartnerHiring', partnerHiringSchema);
