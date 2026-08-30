import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ROLES, ALL_ROLES } from '../constants/roles.constant.js';

const addressSchema = new mongoose.Schema(
  {
    title: { type: String, default: 'Home' }, // 'Home', 'Office', 'Parents'
    addressLine: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, default: '', trim: true },
    pincode: { type: String, default: '', trim: true },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true, timestamps: true }
);

const userSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    name: {
      type: String,
      default: '',
      trim: true,
    },
    email: {
      type: String,
      default: undefined,
      lowercase: true,
      trim: true,
      sparse: true,
      index: true,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      select: false,
    },
    role: {
      type: String,
      enum: ALL_ROLES,
      default: ROLES.CUSTOMER,
    },
    profileImage: {
      type: String,
      default: '',
    },
    dob: {
      type: String,
      default: '',
    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other', ''],
      default: '',
    },
    address: {
      type: String,
      default: '',
    },
    city: {
      type: String,
      default: '',
    },
    assignedCity: {
      type: String,
      default: '',
    },
    state: {
      type: String,
      default: '',
    },
    country: {
      type: String,
      default: 'India',
    },
    status: {
      type: String,
      enum: ['active', 'blocked', 'deleted'],
      default: 'active',
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    isProfileCompleted: {
      type: Boolean,
      default: false,
    },
    isLocationSaved: {
      type: Boolean,
      default: false,
    },
    isDocumentsUploaded: {
      type: Boolean,
      default: false,
    },
    isCategorySelected: {
      type: Boolean,
      default: false,
    },
    isSkillsUpdated: {
      type: Boolean,
      default: false,
    },
    isServiceAreaSet: {
      type: Boolean,
      default: false,
    },
    isWorkingHoursSet: {
      type: Boolean,
      default: false,
    },
    isOnline: {
      type: Boolean,
      default: true,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    agencyName: {
      type: String,
      default: '',
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    kycStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    isKycSubmitted: {
      type: Boolean,
      default: false,
    },
    experience: {
      type: String,
      default: '3-5 Years',
    },
    skills: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Skill',
      },
    ],
    certifications: {
      type: [String],
      default: [],
    },
    workRadius: {
      type: Number,
      default: 8,
    },
    localities: {
      type: [String],
      default: [],
    },
    locationCoordinates: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
    },
    workingHours: [
      {
        day: { type: String, required: true },
        isOpen: { type: Boolean, default: true },
        openTime: { type: String, default: '09:00 AM' },
        closeTime: { type: String, default: '07:00 PM' },
      },
    ],
    documents: {
      aadhaarDoc: { type: String, default: '' },
      aadhaarFront: { type: String, default: '' },
      aadhaarBack: { type: String, default: '' },
      panDoc: { type: String, default: '' },
      drivingLicenseDoc: { type: String, default: '' },
      passportPhoto: { type: String, default: '' },
      bankPassbookDoc: { type: String, default: '' },
      gstDoc: { type: String, default: '' },
      statuses: {
        aadhaarFront: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        aadhaarBack: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        panDoc: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        drivingLicenseDoc: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        bankPassbookDoc: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        passportPhoto: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
      },
      rejectionReasons: {
        aadhaarFront: { type: String, default: '' },
        aadhaarBack: { type: String, default: '' },
        panDoc: { type: String, default: '' },
        drivingLicenseDoc: { type: String, default: '' },
        bankPassbookDoc: { type: String, default: '' },
        passportPhoto: { type: String, default: '' },
      },
    },
    bankDetails: {
      accountHolderName: { type: String, default: '' },
      bankName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      ifscCode: { type: String, default: '' },
      upiId: { type: String, default: '' },
      isVerified: { type: Boolean, default: false },
    },
    referralCode: { type: String, default: '' },
    referralEarnings: { type: Number, default: 0 },
    walletBalance: { type: Number, default: 0 },
    securityDeposit: { type: Number, default: 0 },
    // Advanced Financial Wallet Buckets (Customer & Partner)
    availableBalance: { type: Number, default: 0 },
    heldBalance: { type: Number, default: 0 },
    pendingBalance: { type: Number, default: 0 },
    withdrawableBalance: { type: Number, default: 0 },
    withdrawalPending: { type: Number, default: 0 },
    lifetimeSpent: { type: Number, default: 0 },
    lifetimeEarnings: { type: Number, default: 0 },
    totalCommissionPaid: { type: Number, default: 0 },
    // Two-Way Rating & Review Aggregations
    averageRating: { type: Number, default: 5.0 },
    totalRatings: { type: Number, default: 0 },
    ratingBreakdown: {
      1: { type: Number, default: 0 },
      2: { type: Number, default: 0 },
      3: { type: Number, default: 0 },
      4: { type: Number, default: 0 },
      5: { type: Number, default: 0 },
    },
    notificationPreferences: {
      allowNotifications: { type: Boolean, default: true },
      jobAlerts: { type: Boolean, default: true },
      surgeAlerts: { type: Boolean, default: true },
      whatsappNotifs: { type: Boolean, default: true },
      chatMessagesAlerts: { type: Boolean, default: true },
      scheduleReminders: { type: Boolean, default: true },
      soundAlert: { type: Boolean, default: true },
      vibrationAlert: { type: Boolean, default: true },
    },
    privacySecurity: {
      twoFactor: { type: Boolean, default: true },
      biometric: { type: Boolean, default: true },
      loginAlerts: { type: Boolean, default: true },
      locationSharing: { type: String, default: 'Only while working' },
    },
    preferredLanguage: { type: String, default: 'English' },
    addresses: [addressSchema],
    favoriteServices: [{ type: String, trim: true }],
    refreshToken: {
      type: String,
      select: false,
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

/**
 * Pre-Validate Middleware to automatically filter out non-ObjectId skill strings
 */
userSchema.pre('validate', function (next) {
  if (Array.isArray(this.skills)) {
    this.skills = this.skills.filter(
      (s) =>
        (typeof s === 'string' && Boolean(s.match(/^[0-9a-fA-F]{24}$/))) ||
        (s && (s._id || s instanceof mongoose.Types.ObjectId))
    );
  }
  next();
});

/**
 * Pre-Save Middleware to automatically hash password using bcryptjs
 */
userSchema.pre('save', async function (next) {
  if (this.role === ROLES.PARTNER && this.documents) {
    if (!this.documents.statuses) {
      this.documents.statuses = {
        aadhaarFront: 'pending',
        aadhaarBack: 'pending',
        panDoc: 'pending',
        drivingLicenseDoc: 'pending',
        bankPassbookDoc: 'pending',
        passportPhoto: 'pending',
      };
    }
    const docKeys = ['aadhaarFront', 'aadhaarBack', 'panDoc', 'drivingLicenseDoc', 'bankPassbookDoc', 'passportPhoto'];
    for (const key of docKeys) {
      if (!this.documents[key]) {
        this.documents.statuses[key] = 'pending';
      }
    }
  }

  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

/**
 * Instance Method: Compare candidate password with hashed password
 */
userSchema.methods.isPasswordCorrect = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

/**
 * Instance Method: Generate JWT Access Token
 */
userSchema.methods.generateAccessToken = function () {
  if (!process.env.ACCESS_TOKEN_SECRET) {
    throw new Error('ACCESS_TOKEN_SECRET environment variable is missing.');
  }
  return jwt.sign(
    {
      id: this._id,
      userId: this.userId || '',
      email: this.email || '',
      role: this.role,
      name: this.name || '',
      kycStatus: this.kycStatus,
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '1d',
    }
  );
};

/**
 * Instance Method: Generate JWT Refresh Token
 */
userSchema.methods.generateRefreshToken = function () {
  if (!process.env.REFRESH_TOKEN_SECRET) {
    throw new Error('REFRESH_TOKEN_SECRET environment variable is missing.');
  }
  return jwt.sign(
    {
      id: this._id,
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY || '7d',
    }
  );
};

export const User = mongoose.model('User', userSchema);
