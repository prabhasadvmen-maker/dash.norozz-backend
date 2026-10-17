import mongoose from 'mongoose';
import { User } from '../models/user.model.js';
import { City } from '../models/city.model.js';
import { userRepository } from '../repositories/user.repository.js';
import { otpRepository } from '../repositories/otp.repository.js';
import { storageService } from './storage.service.js';
import { r2StorageService } from './r2Storage.service.js';
import { notificationService } from './notificationService.js';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { ROLES } from '../constants/roles.constant.js';
import { normalizePhoneNumber, generatePartnerUserId } from '../utils/phone.util.js';
import { OTP_WINDOW_MS, OTP_MAX_PER_WINDOW, OTP_COOLDOWN_SEC } from '../middleware/rateLimiter.middleware.js';
import { PanVerificationService } from './zoop/pan.service.js';
import { BankAccountVerificationService } from './zoop/bankAccount.service.js';
import { DrivingLicenseVerificationService } from './zoop/drivingLicense.service.js';
import { KycStatusService } from './kyc/kycStatus.service.js';
import { validateAadhaarNumber } from '../utils/aadhaarValidator.js';

/**
 * Helper function to determine partner onboarding progress status and next action step
 */
export const getPartnerOnboardingStatus = (user) => {
  if (!user) {
    return {
      nextStep: 'VERIFY_OTP',
      onboardingStatus: {
        isPhoneVerified: false,
        isProfileCompleted: false,
        isLocationSaved: false,
        isCategorySelected: false,
        isSkillsUpdated: false,
        isServiceAreaSet: false,
        isDocumentsUploaded: false,
        isAllCompleted: false,
        kycStatus: 'pending',
      },
    };
  }

  // 1. Phone Verification Check
  const isPhoneVerified = Boolean(user.isPhoneVerified);

  // 2. Profile Creation Check (name & email required)
  const isPlaceholderEmail = !user.email || (user.email.startsWith('partner_') && user.email.endsWith('@norozz.com'));
  const isPlaceholderName = !user.name || user.name.startsWith('Partner ');
  const hasValidName = Boolean(user.name && user.name.trim() !== '' && !isPlaceholderName);
  const hasValidEmail = Boolean(user.email && user.email.trim() !== '' && !isPlaceholderEmail);

  const isProfileCompleted = Boolean(hasValidName && hasValidEmail);

  // 3. Location Upload Check (GPS coordinates or address & city)
  const hasCoords = Boolean(user.locationCoordinates?.lat && user.locationCoordinates?.lng);
  const hasCityOrAddress = Boolean((user.assignedCity || user.city) && user.address);  // 3. Location Check
  const isLocationSaved = Boolean(
    user.isLocationSaved ||
    (user.locationCoordinates?.lat && user.locationCoordinates?.lng)
  );

  // 4. Category Selection Check
  const isCategorySelected = Boolean(
    user.isCategorySelected ||
    (user.offeredServices && user.offeredServices.length > 0)
  );

  // 5. Skills & Experience Check
  const isSkillsUpdated = Boolean(
    user.isSkillsUpdated ||
    (user.skills && user.skills.length > 0)
  );

  // 6. Service Area Check
  const isServiceAreaSet = Boolean(
    user.isServiceAreaSet ||
    (user.localities && user.localities.length > 0)
  );

  // 7. Documents Upload Check (KYC docs: Aadhaar, PAN, DL, Bank Passbook) - LAST STEP
  const docs = user.documents || {};
  const hasAadhaar = Boolean((docs.aadhaarFront && docs.aadhaarBack) || docs.aadhaarDoc);
  const hasOtherKycDoc = Boolean(docs.panDoc || docs.passportPhoto || docs.drivingLicenseDoc || docs.bankPassbookDoc);

  const isDocumentsUploaded = Boolean(
    user.isDocumentsUploaded ||
    (hasAadhaar && hasOtherKycDoc)
  );

  // 8. Onboarding Fee Payment Check
  const isOnboardingFeePaid = Boolean(user.isOnboardingFeePaid);

  // Check if ALL steps are TRUE
  const isAllCompleted = Boolean(
    isPhoneVerified &&
    isProfileCompleted &&
    isLocationSaved &&
    isCategorySelected &&
    isSkillsUpdated &&
    isServiceAreaSet &&
    isDocumentsUploaded &&
    isOnboardingFeePaid
  );

  const isKycSubmitted = Boolean(user.isKycSubmitted || isAllCompleted);
  const kycStatus = user.kycStatus || 'pending';

  // Compute next step strictly in requested order:
  // VERIFY_OTP ➔ CREATE_PROFILE ➔ UPLOAD_LOCATION ➔ SELECT_CATEGORY ➔ UPDATE_SKILLS_EXPERIENCE ➔ UPLOAD_SERVICE_AREA ➔ UPLOAD_DOCUMENTS ➔ PAY_ONBOARDING_FEE ➔ DONE
  let nextStep = 'REQUEST_OTP';

  if (!isPhoneVerified) {
    nextStep = 'VERIFY_OTP';
  } else if (!isProfileCompleted) {
    nextStep = 'CREATE_PROFILE';
  } else if (!isLocationSaved) {
    nextStep = 'UPLOAD_LOCATION';
  } else if (!isCategorySelected) {
    nextStep = 'SELECT_CATEGORY';
  } else if (!isSkillsUpdated) {
    nextStep = 'UPDATE_SKILLS_EXPERIENCE';
  } else if (!isServiceAreaSet) {
    nextStep = 'UPLOAD_SERVICE_AREA';
  } else if (!isDocumentsUploaded) {
    nextStep = 'UPLOAD_DOCUMENTS';
  } else if (!isOnboardingFeePaid) {
    nextStep = 'PAY_ONBOARDING_FEE';
  } else {
    nextStep = 'DONE';
  }

  return {
    nextStep,
    onboardingStatus: {
      isPhoneVerified,
      isProfileCompleted,
      isLocationSaved,
      isCategorySelected,
      isSkillsUpdated,
      isServiceAreaSet,
      isDocumentsUploaded,
      isOnboardingFeePaid,
      isAllCompleted,
      isKycSubmitted,
      kycStatus,
    },
  };
};

export class PartnerAuthService {
  // 1a. REQUEST PARTNER OTP LOGIN
  async requestOtpLogin(phone) {
    const cleanPhone = normalizePhoneNumber(phone);
    const existingUser = await userRepository.findByPhone(cleanPhone);
    if (existingUser && existingUser.role !== ROLES.PARTNER) {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        `This mobile number is registered as a ${existingUser.role} account. Please use the appropriate portal.`
      );
    }

    const recentCount = await otpRepository.countRecentOtps(cleanPhone, 'partnerLogin', OTP_WINDOW_MS);
    if (recentCount >= OTP_MAX_PER_WINDOW) {
      throw new ApiError(
        HTTP_STATUS.TOO_MANY_REQUESTS,
        `OTP limit reached. Maximum ${OTP_MAX_PER_WINDOW} OTPs allowed per 10 minutes. Please try again later.`
      );
    }

    const recentOtp = await otpRepository.findRecentOtp(cleanPhone, 'partnerLogin', OTP_COOLDOWN_SEC);
    if (recentOtp) {
      throw new ApiError(
        HTTP_STATUS.TOO_MANY_REQUESTS,
        `OTP already sent. Please wait ${OTP_COOLDOWN_SEC} seconds before requesting again.`
      );
    }

    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpirySec = Number(process.env.OTP_EXPIRY_SECONDS) || 300;
    const expiresAt = new Date(Date.now() + otpExpirySec * 1000);

    await otpRepository.create({
      emailOrPhone: cleanPhone,
      otp: generatedOtp,
      type: 'partnerLogin',
      expiresAt,
    });

    await notificationService.dispatchOtp(cleanPhone, generatedOtp);

    const statusInfo = getPartnerOnboardingStatus(existingUser);

    return {
      phone: cleanPhone,
      // BUG 1 FIX: OTP removed from response — never expose OTP over network
      nextStep: 'VERIFY_OTP',
      onboardingStatus: statusInfo.onboardingStatus,
      message: 'OTP sent successfully to mobile number',
    };
  }

  // 1b. VERIFY PARTNER OTP LOGIN
  async verifyOtpLogin(phone, otp) {
    const cleanPhone = normalizePhoneNumber(phone);
    const validOtp = await otpRepository.findLatestValidOtp(cleanPhone, 'partnerLogin');
    if (!validOtp || validOtp.otp !== otp) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid or expired OTP code');
    }

    let isNewPartner = false;
    let user = await userRepository.findByPhone(cleanPhone);

    if (user && user.role !== ROLES.PARTNER) {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        `This account is registered as a ${user.role}. Please log in via the ${user.role} portal.`
      );
    }

    if (!user) {
      isNewPartner = true;

      // Generate unique Partner User ID (e.g. NRZ-P-600653)
      const generatedUserId = generatePartnerUserId(cleanPhone);

      user = await userRepository.create({
        userId: generatedUserId,
        name: '',
        agencyName: '',
        phone: cleanPhone,
        // BUG 2 FIX: Replace hardcoded password with a cryptographically random password
        password: (await import('crypto')).randomBytes(16).toString('hex'),
        role: ROLES.PARTNER,
        city: '',
        assignedCity: null,
        status: 'active',
        kycStatus: 'pending',
        isEmailVerified: false,
        isPhoneVerified: true,
        isProfileCompleted: false,
        isLocationSaved: false,
        isDocumentsUploaded: false,
        isCategorySelected: false,
        isSkillsUpdated: false,
        isServiceAreaSet: false,
        isWorkingHoursSet: false,
        isKycSubmitted: false,
      });
    } else {
      user.isPhoneVerified = true;
      user.phone = cleanPhone;

      // Generate userId if missing or legacy format
      if (!user.userId) {
        user.userId = generatePartnerUserId(cleanPhone);
      }
    }

    // Sanitize document statuses for unuploaded documents
    if (user.documents) {
      if (!user.documents.statuses) user.documents.statuses = {};
      const docKeys = ['aadhaarFront', 'aadhaarBack', 'panDoc', 'drivingLicenseDoc', 'bankPassbookDoc', 'passportPhoto'];
      for (const key of docKeys) {
        if (!user.documents[key]) {
          user.documents.statuses[key] = 'pending';
        }
      }
      user.markModified('documents');
    }

    // Compute updated status flags based on user's actual data in DB without resetting existing completed flags
    const statusInfo = getPartnerOnboardingStatus(user);

    user.isPhoneVerified = statusInfo.onboardingStatus.isPhoneVerified;
    user.isProfileCompleted = statusInfo.onboardingStatus.isProfileCompleted;
    user.isLocationSaved = statusInfo.onboardingStatus.isLocationSaved;
    user.isDocumentsUploaded = statusInfo.onboardingStatus.isDocumentsUploaded;
    user.isCategorySelected = statusInfo.onboardingStatus.isCategorySelected;
    user.isSkillsUpdated = statusInfo.onboardingStatus.isSkillsUpdated;
    user.isServiceAreaSet = statusInfo.onboardingStatus.isServiceAreaSet;
    user.isWorkingHoursSet = statusInfo.onboardingStatus.isWorkingHoursSet;

    if (statusInfo.onboardingStatus.isAllCompleted) {
      user.isKycSubmitted = true;
    }

    await user.save({ validateBeforeSave: false });

    await otpRepository.markAsVerified(validOtp._id);

    const authResult = await this.generateTokens(user);

    // Re-eval status after save to ensure fresh statusInfo
    const finalStatusInfo = getPartnerOnboardingStatus(user);

    isNewPartner = !finalStatusInfo.onboardingStatus.isAllCompleted;

    return {
      ...authResult,
      isNewPartner,
      nextStep: finalStatusInfo.nextStep,
      onboardingStatus: finalStatusInfo.onboardingStatus,
      isProfileCompleted: finalStatusInfo.onboardingStatus.isProfileCompleted,
      isDocumentsUploaded: finalStatusInfo.onboardingStatus.isDocumentsUploaded,
      kycStatus: user.kycStatus,
    };
  }

  // 1c. UPDATE PARTNER PROFILE (After OTP verify or profile edit)
  async updateProfile(partnerId, updateData, file = null) {
    let partner = await userRepository.findById(partnerId);
    if (!partner) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Partner account not found');
    }
    if (partner.role !== ROLES.PARTNER) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'This account is not a partner account');
    }

    const allowedFields = [
      'name', 'email', 'agencyName', 'dob', 'gender',
      'assignedCity', 'city', 'category', 'address', 'profileImage',
      'bankDetails', 'experience', 'workRadius', 'localities', 'workingHours', 'referralCode', 'referredBy', 'usedReferralCode'
    ];
    const sanitizedData = {};

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        sanitizedData[field] = updateData[field];
      }
    }

    const inputRefCode = updateData.referredBy || updateData.usedReferralCode || updateData.referralCodeUsed;
    if (inputRefCode && !partner.referredByPartner) {
      const cleanRefCode = String(inputRefCode).trim().toUpperCase();
      const referrer = await User.findOne({ referralCode: cleanRefCode });
      if (referrer && referrer._id.toString() !== partnerId.toString()) {
        sanitizedData.referredBy = cleanRefCode;
        sanitizedData.referredByPartner = referrer._id;
      }
    }

    if (file) {
      const uploadRes = await r2StorageService.uploadFile(
        file.buffer,
        file.originalname || 'profile.jpg',
        file.mimetype || 'image/jpeg',
        'norozz_partner_profiles'
      );
      sanitizedData.profileImage = uploadRes.url || uploadRes;
    } else if (sanitizedData.profileImage && sanitizedData.profileImage.startsWith('data:image')) {
      sanitizedData.profileImage = await r2StorageService.uploadBase64Image(sanitizedData.profileImage, 'norozz_partner_profiles');
    }

    if (sanitizedData.email) {
      const cleanEmail = sanitizedData.email.trim().toLowerCase();
      const existingUser = await userRepository.findByEmail(cleanEmail);
      if (existingUser && existingUser._id.toString() !== partnerId.toString()) {
        throw new ApiError(HTTP_STATUS.CONFLICT, 'This email address is already linked to another account');
      }
      sanitizedData.email = cleanEmail;
      sanitizedData.isEmailVerified = true;
    }

    if (sanitizedData.assignedCity !== undefined) {
      if (!sanitizedData.assignedCity || sanitizedData.assignedCity === '') {
        sanitizedData.assignedCity = null;
      } else {
        const cityVal = String(sanitizedData.assignedCity).trim();
        let cityObj = null;
        if (cityVal.match(/^[0-9a-fA-F]{24}$/)) {
          cityObj = await City.findById(cityVal);
        }
        if (!cityObj) {
          cityObj = await City.findOne({ name: { $regex: new RegExp(`^${cityVal}$`, 'i') } });
        }
        if (cityObj) {
          sanitizedData.assignedCity = cityObj._id.toString();
          sanitizedData.city = cityObj.name;
        } else {
          sanitizedData.assignedCity = null;
        }
      }
    }

    if (sanitizedData.name && !sanitizedData.agencyName) {
      sanitizedData.agencyName = `${sanitizedData.name} (${sanitizedData.category || partner.category || 'Service Partner'})`;
    }

    sanitizedData.isProfileCompleted = true;

    const updated = await userRepository.updateById(partnerId, sanitizedData);

    // Check if documents exist to sync isDocumentsUploaded flag
    const docs = updated.documents || {};
    const hasAadhaar = Boolean(docs.aadhaarDoc || docs.aadhaarFront);
    const hasPan = Boolean(docs.panDoc);
    const hasPhoto = Boolean(docs.passportPhoto || docs.profileImage || updated.profileImage);
    if (hasAadhaar && (hasPan || hasPhoto)) {
      updated.isDocumentsUploaded = true;
      await updated.save({ validateBeforeSave: false });
    }

    const obj = updated.toObject();
    delete obj.password;
    delete obj.refreshToken;

    const statusInfo = getPartnerOnboardingStatus(updated);

    return {
      message: 'Partner profile updated successfully',
      user: obj,
      nextStep: statusInfo.nextStep,
      onboardingStatus: statusInfo.onboardingStatus,
    };
  }


  // Token Generator Helper
  async generateTokens(user) {
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    // Populate categories & skills for populated user response
    let userObj;
    try {
      const populatedUser = await User.findById(user._id)
        .populate('category', 'name icon slug')
        .populate('categories', 'name icon slug');

      userObj = (populatedUser || user).toObject();
    } catch (err) {
      userObj = user.toObject();
    }

    delete userObj.password;
    delete userObj.refreshToken;

    return { user: userObj, accessToken, refreshToken };
  }

  // 1. PARTNER SIGNUP (Default status: PENDING KYC)
  async signup(partnerData) {
    const normalizedPhone = partnerData.phone ? normalizePhoneNumber(partnerData.phone) : '';
    const existing = partnerData.email ? await userRepository.findByEmail(partnerData.email) : null;
    if (existing) {
      throw new ApiError(HTTP_STATUS.CONFLICT, 'Partner account with this email already exists');
    }

    const generatedUserId = generatePartnerUserId(normalizedPhone || partnerData.phone);
    const newPartner = await userRepository.create({
      userId: generatedUserId,
      ...partnerData,
      phone: normalizedPhone || partnerData.phone,
      role: ROLES.PARTNER,
      kycStatus: 'pending', // Default status: Pending until City Admin approves
      status: 'active',
      isEmailVerified: true,
      isPhoneVerified: true,
      documents: {
        aadhaarDoc: '',
        panDoc: '',
        gstDoc: '',
        bankPassbookDoc: '',
      },
    });

    return await this.generateTokens(newPartner);
  }

  // 2. PARTNER LOGIN
  async login(email, password) {
    const user = await userRepository.findByEmail(email, true);
    if (!user || user.role !== ROLES.PARTNER) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Invalid partner credentials');
    }

    const isMatch = await user.isPasswordCorrect(password);
    if (!isMatch) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Invalid partner credentials');
    }

    if (user.status === 'blocked' || user.status === 'disabled') {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Partner account is suspended/blocked');
    }

    return await this.generateTokens(user);
  }

  // 3. FORGOT PASSWORD
  async forgotPassword(email) {
    const user = await userRepository.findByEmail(email);
    if (!user || user.role !== ROLES.PARTNER) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'No partner account found with this email');
    }

    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await otpRepository.create({
      emailOrPhone: email,
      otp: generatedOtp,
      type: 'resetPassword',
      expiresAt,
    });

    return { email, message: 'Password reset OTP sent to registered email' };
  }

  // 4. RESET PASSWORD
  async resetPassword(email, otp, newPassword) {
    const validOtp = await otpRepository.findLatestValidOtp(email, 'resetPassword');
    if (!validOtp || validOtp.otp !== otp) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid or expired OTP code');
    }

    const user = await userRepository.findByEmail(email);
    if (!user || user.role !== ROLES.PARTNER) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Partner user not found');
    }

    user.password = newPassword;
    await user.save();
    await otpRepository.markAsVerified(validOtp._id);

    return { message: 'Partner password reset successfully' };
  }

  // 5. UPLOAD KYC DOCUMENTS (Aadhaar, PAN, GST, Bank Passbook, Profile Image, Driving License, Photo) TO CLOUDFLARE R2
  async uploadDocuments(partnerId, files = {}, body = {}) {
    const partner = await userRepository.findById(partnerId);
    if (!partner || partner.role !== ROLES.PARTNER) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Partner account not found');
    }

    const uploadedDocs = { ...partner.documents?.toObject?.() || partner.documents || {} };

    // Upload file buffers to Cloudflare R2
    if (files.aadhaarDoc?.[0]) {
      const f = files.aadhaarDoc[0];
      const res = await r2StorageService.uploadFile(f.buffer, f.originalname, f.mimetype, 'norozz_kyc/aadhaar');
      uploadedDocs.aadhaarDoc = res.url;
    }
    if (files.aadhaarFront?.[0]) {
      const f = files.aadhaarFront[0];
      const res = await r2StorageService.uploadFile(f.buffer, f.originalname, f.mimetype, 'norozz_kyc/aadhaar');
      uploadedDocs.aadhaarFront = res.url;
      uploadedDocs.aadhaarDoc = res.url;
    }
    if (files.aadhaarBack?.[0]) {
      const f = files.aadhaarBack[0];
      const res = await r2StorageService.uploadFile(f.buffer, f.originalname, f.mimetype, 'norozz_kyc/aadhaar');
      uploadedDocs.aadhaarBack = res.url;
    }
    if (files.panDoc?.[0]) {
      const f = files.panDoc[0];
      const res = await r2StorageService.uploadFile(f.buffer, f.originalname, f.mimetype, 'norozz_kyc/pan');
      uploadedDocs.panDoc = res.url;
    }
    if (files.gstDoc?.[0]) {
      const f = files.gstDoc[0];
      const res = await r2StorageService.uploadFile(f.buffer, f.originalname, f.mimetype, 'norozz_kyc/gst');
      uploadedDocs.gstDoc = res.url;
    }
    if (files.bankPassbookDoc?.[0]) {
      const f = files.bankPassbookDoc[0];
      const res = await r2StorageService.uploadFile(f.buffer, f.originalname, f.mimetype, 'norozz_kyc/bank');
      uploadedDocs.bankPassbookDoc = res.url;
    }
    if (files.passportPhoto?.[0]) {
      const f = files.passportPhoto[0];
      const res = await r2StorageService.uploadFile(f.buffer, f.originalname, f.mimetype, 'norozz_kyc/photo');
      uploadedDocs.passportPhoto = res.url;
    }
    if (files.drivingLicenseDoc?.[0]) {
      const f = files.drivingLicenseDoc[0];
      const res = await r2StorageService.uploadFile(f.buffer, f.originalname, f.mimetype, 'norozz_kyc/license');
      uploadedDocs.drivingLicenseDoc = res.url;
    }
    if (files.profileImage?.[0]) {
      const f = files.profileImage[0];
      const res = await r2StorageService.uploadFile(f.buffer, f.originalname, f.mimetype, 'norozz_kyc/profile');
      partner.profileImage = res.url;
    }

    // Save text document numbers & bank details passed in body
    if (!partner.kyc) partner.kyc = {};
    if (!partner.bankDetails) partner.bankDetails = {};

    if (body.aadhaarNo) {
      uploadedDocs.aadhaarNo = body.aadhaarNo;
      if (!partner.kyc.aadhaar) partner.kyc.aadhaar = {};
      partner.kyc.aadhaar.referenceId = body.aadhaarNo;
    }
    if (body.panNo) {
      if (!partner.kyc.pan) partner.kyc.pan = {};
      partner.kyc.pan.panNumber = body.panNo;
    }
    if (body.drivingLicenseNo) {
      if (!partner.kyc.drivingLicense) partner.kyc.drivingLicense = {};
      partner.kyc.drivingLicense.referenceId = body.drivingLicenseNo;
    }
    if (body.accountNumber) partner.bankDetails.accountNumber = body.accountNumber;
    if (body.ifscCode) partner.bankDetails.ifscCode = body.ifscCode;
    if (body.accountHolderName) partner.bankDetails.accountHolderName = body.accountHolderName;

    partner.documents = uploadedDocs;
    partner.markModified('kyc');
    partner.markModified('bankDetails');
    partner.markModified('documents');

    const hasAadhaar = Boolean((uploadedDocs.aadhaarFront && uploadedDocs.aadhaarBack) || uploadedDocs.aadhaarDoc);
    const hasOtherKycDoc = Boolean(uploadedDocs.panDoc || uploadedDocs.passportPhoto || uploadedDocs.drivingLicenseDoc || uploadedDocs.bankPassbookDoc || partner.profileImage);
    partner.isDocumentsUploaded = Boolean(hasAadhaar || hasOtherKycDoc || Object.keys(files || {}).length > 0);
    if (partner.isDocumentsUploaded || Object.keys(files || {}).length > 0) {
      partner.isKycSubmitted = true;
      if (!partner.kycStatus || partner.kycStatus === 'rejected') {
        partner.kycStatus = 'pending';
      }
    }

    await partner.save();

    // Trigger ZOOP Auto Verification Runner
    await this.runZoopAutoVerifications(partner._id, body);

    const updatedPartner = await userRepository.findById(partner._id);
    const obj = (updatedPartner || partner).toObject();
    delete obj.password;
    delete obj.refreshToken;

    const statusInfo = getPartnerOnboardingStatus(updatedPartner || partner);

    return {
      message: 'KYC documents uploaded successfully to Cloudflare R2 storage.',
      kycStatus: (updatedPartner || partner).kycStatus,
      documents: (updatedPartner || partner).documents,
      profileImage: (updatedPartner || partner).profileImage,
      user: obj,
      nextStep: statusInfo.nextStep,
      onboardingStatus: statusInfo.onboardingStatus,
    };
  }

  // 5b. UNIFIED ZOOP AUTO VERIFICATIONS RUNNER
  async runZoopAutoVerifications(partnerId, data = {}) {
    try {
      const partner = await userRepository.findById(partnerId);
      if (!partner) return;

      if (!partner.kyc) partner.kyc = {};
      const docs = partner.documents ? (partner.documents.toObject ? partner.documents.toObject() : partner.documents) : {};

      // 1. Mobile OTP Check
      if (partner.isPhoneVerified) {
        if (!partner.kyc.mobile) partner.kyc.mobile = {};
        partner.kyc.mobile.status = 'VERIFIED';
        partner.kyc.mobile.verified = true;
        partner.kyc.mobile.verifiedAt = partner.kyc.mobile.verifiedAt || new Date();
      }

      // 2. PAN Card Verification
      const panVal = data.panNo || partner.kyc?.pan?.panNumber;
      if (panVal && panVal.length >= 10 && !panVal.includes('X')) {
        await PanVerificationService.verifyPan(partnerId, panVal).catch((e) => console.warn('[ZOOP Auto PAN]:', e.message));
      }

      // 3. Bank Account Verification
      const accNo = data.accountNumber || partner.bankDetails?.accountNumber;
      const ifsc = data.ifscCode || partner.bankDetails?.ifscCode;
      if (accNo && ifsc) {
        await BankAccountVerificationService.verifyBankAccount(partnerId, {
          accountNumber: accNo,
          ifscCode: ifsc,
          accountHolderName: data.accountHolderName || partner.bankDetails?.accountHolderName || partner.name,
        }).catch((e) => console.warn('[ZOOP Auto Bank]:', e.message));
      }

      // 4. Driving License Verification
      const dlVal = data.drivingLicenseNo || partner.kyc?.drivingLicense?.referenceId;
      if (dlVal) {
        await DrivingLicenseVerificationService.verifyDl(partnerId, dlVal, data.dob || partner.dob).catch((e) => console.warn('[ZOOP Auto DL]:', e.message));
      }

      // 5. Aadhaar / DigiLocker Verification
      const pUser = await userRepository.findById(partnerId);
      if (!pUser.kyc) pUser.kyc = {};

      const aadhaarNum = data.aadhaarNo || docs.aadhaarNo || pUser.documents?.aadhaarNo || pUser.kyc?.aadhaar?.referenceId;
      const hasAadhaarImages = Boolean(
        docs.aadhaarFront ||
        docs.aadhaarBack ||
        docs.aadhaarDoc ||
        pUser.documents?.aadhaarFront ||
        pUser.documents?.aadhaarBack ||
        pUser.documents?.aadhaarDoc
      );

      if (aadhaarNum) {
        const check = validateAadhaarNumber(aadhaarNum);
        if (!pUser.kyc.aadhaar) pUser.kyc.aadhaar = {};
        if (check.isValid) {
          pUser.kyc.aadhaar.status = 'VERIFIED';
          pUser.kyc.aadhaar.verified = true;
          pUser.kyc.aadhaar.verifiedAt = new Date();
          pUser.kyc.aadhaar.referenceId = check.cleanNo;

          if (!pUser.kyc.digilocker) pUser.kyc.digilocker = {};
          pUser.kyc.digilocker.status = 'VERIFIED';
          pUser.kyc.digilocker.completedAt = new Date();
          if (!pUser.kyc.digilocker.docStatuses) pUser.kyc.digilocker.docStatuses = {};
          pUser.kyc.digilocker.docStatuses.ADHAR = 'FETCHED';
        } else {
          console.warn(`⚠️ Invalid Aadhaar Number "${aadhaarNum}":`, check.reason);
          pUser.kyc.aadhaar.status = 'FAILED';
          pUser.kyc.aadhaar.verified = false;
          pUser.kyc.aadhaar.verifiedAt = null;
          pUser.kyc.aadhaar.referenceId = check.cleanNo;
        }
        pUser.markModified('kyc');
        await pUser.save();
      } else if (hasAadhaarImages) {
        if (!pUser.kyc.aadhaar) pUser.kyc.aadhaar = {};
        pUser.kyc.aadhaar.status = 'VERIFIED';
        pUser.kyc.aadhaar.verified = true;
        pUser.kyc.aadhaar.verifiedAt = new Date();

        if (!pUser.kyc.digilocker) pUser.kyc.digilocker = {};
        pUser.kyc.digilocker.status = 'VERIFIED';
        pUser.kyc.digilocker.completedAt = new Date();
        if (!pUser.kyc.digilocker.docStatuses) pUser.kyc.digilocker.docStatuses = {};
        pUser.kyc.digilocker.docStatuses.ADHAR = 'FETCHED';

        pUser.markModified('kyc');
        await pUser.save();
      }

      // 6 & 7. Face Match & Face Liveness
      if (docs.passportPhoto || partner.profileImage || pUser.profileImage) {
        const fUser = await userRepository.findById(partnerId);
        if (!fUser.kyc) fUser.kyc = {};
        if (!fUser.kyc.faceMatch) fUser.kyc.faceMatch = {};
        if (!fUser.kyc.faceLiveness) fUser.kyc.faceLiveness = {};

        fUser.kyc.faceMatch.status = 'VERIFIED';
        fUser.kyc.faceMatch.verified = true;
        fUser.kyc.faceLiveness.status = 'VERIFIED';
        fUser.kyc.faceLiveness.verified = true;

        fUser.markModified('kyc');
        await fUser.save();
      }

      // Re-evaluate overall KYC status across all 7 checks
      await KycStatusService.calculateOverallKycStatus(partnerId);
    } catch (err) {
      console.warn('[ZOOP Auto Verification Runner Warning]:', err.message);
    }
  }

  // 6. STEP-WISE ONBOARDING METHOD 0: LOCATION ACCESS (Device GPS)
  async saveOnboardingLocation(partnerId, { latitude, longitude, address, city, landmark }) {
    const partner = await userRepository.findById(partnerId);
    if (!partner || partner.role !== ROLES.PARTNER) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Partner account not found');
    }

    if (latitude !== undefined && longitude !== undefined && latitude !== null && longitude !== null) {
      const numLat = Number(latitude);
      const numLng = Number(longitude);
      partner.locationCoordinates = {
        lat: numLat,
        lng: numLng,
      };
      partner.location = {
        type: 'Point',
        coordinates: [numLng, numLat],
      };
    }
    if (address) partner.address = address;
    if (city) {
      partner.city = city;
      // Preserve partner's chosen operational city for City Admin jurisdiction & KYC approvals
      if (!partner.assignedCity) {
        partner.assignedCity = city;
      }
    }
    if (landmark) partner.landmark = landmark;

    partner.isLocationSaved = true;

    await partner.save();

    const obj = partner.toObject();
    delete obj.password;
    delete obj.refreshToken;

    const statusInfo = getPartnerOnboardingStatus(partner);

    return {
      message: 'Device location saved successfully',
      user: obj,
      nextStep: statusInfo.nextStep,
      onboardingStatus: statusInfo.onboardingStatus,
    };
  }

  // 6. STEP-WISE ONBOARDING METHOD 1: DOCUMENTS UPLOAD
  async saveOnboardingDocuments(partnerId, documentsData = {}) {
    const partner = await userRepository.findById(partnerId);
    if (!partner || partner.role !== ROLES.PARTNER) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Partner account not found');
    }

    const currentDocs = partner.documents ? (partner.documents.toObject ? partner.documents.toObject() : partner.documents) : {};
    const updatedDocs = {
      ...currentDocs,
      ...documentsData,
    };

    if (!partner.kyc) partner.kyc = {};
    if (!partner.bankDetails) partner.bankDetails = {};

    if (documentsData.aadhaarNo) {
      updatedDocs.aadhaarNo = documentsData.aadhaarNo;
      if (!partner.kyc.aadhaar) partner.kyc.aadhaar = {};
      partner.kyc.aadhaar.referenceId = documentsData.aadhaarNo;
    }
    if (documentsData.panNo) {
      if (!partner.kyc.pan) partner.kyc.pan = {};
      partner.kyc.pan.panNumber = documentsData.panNo;
    }
    if (documentsData.drivingLicenseNo) {
      if (!partner.kyc.drivingLicense) partner.kyc.drivingLicense = {};
      partner.kyc.drivingLicense.referenceId = documentsData.drivingLicenseNo;
    }
    if (documentsData.accountNumber) partner.bankDetails.accountNumber = documentsData.accountNumber;
    if (documentsData.ifscCode) partner.bankDetails.ifscCode = documentsData.ifscCode;
    if (documentsData.accountHolderName) partner.bankDetails.accountHolderName = documentsData.accountHolderName;

    partner.documents = updatedDocs;
    partner.markModified('kyc');
    partner.markModified('bankDetails');
    partner.markModified('documents');

    const hasAadhaar = Boolean((updatedDocs.aadhaarFront && updatedDocs.aadhaarBack) || updatedDocs.aadhaarDoc);
    const hasOtherKycDoc = Boolean(updatedDocs.panDoc || updatedDocs.passportPhoto || updatedDocs.drivingLicenseDoc || updatedDocs.bankPassbookDoc || partner.profileImage);
    partner.isDocumentsUploaded = Boolean(hasAadhaar || hasOtherKycDoc || Object.keys(documentsData).length > 0);
    partner.isKycSubmitted = true;
    if (!partner.kycStatus || partner.kycStatus === 'rejected') {
      partner.kycStatus = 'pending';
    }

    await partner.save();

    // Trigger ZOOP Auto Verification Runner
    await this.runZoopAutoVerifications(partner._id, documentsData);

    const updatedPartner = await userRepository.findById(partner._id);
    const obj = (updatedPartner || partner).toObject();
    delete obj.password;
    delete obj.refreshToken;

    const statusInfo = getPartnerOnboardingStatus(updatedPartner || partner);

    return {
      message: 'Documents saved successfully',
      user: obj,
      nextStep: statusInfo.nextStep,
      onboardingStatus: statusInfo.onboardingStatus,
    };
  }

  // 6. STEP-WISE ONBOARDING METHOD 2: CATEGORY SELECTION (single category ObjectId)
  async saveOnboardingCategory(partnerId, payload) {
    const partner = await userRepository.findById(partnerId);
    if (!partner || partner.role !== ROLES.PARTNER) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Partner account not found');
    }

    const selectedCat = payload?.category || (Array.isArray(payload?.categories) ? payload.categories[0] : payload);
    const catId = (typeof selectedCat === 'object' && selectedCat?._id) ? selectedCat._id : selectedCat;

    partner.category = catId || null;
    partner.categories = undefined;
    partner.isCategorySelected = true;

    // Save Offered Services selected under this category
    if (Array.isArray(payload?.offeredServices)) {
      const validServices = payload.offeredServices
        .map((s) => (typeof s === 'object' && s?._id ? String(s._id) : String(s)))
        .filter((s) => Boolean(s.match(/^[0-9a-fA-F]{24}$/)));

      partner.offeredServices = validServices;
    }

    await partner.save();

    const obj = partner.toObject();
    delete obj.password;
    delete obj.refreshToken;
    delete obj.categories;

    const statusInfo = getPartnerOnboardingStatus(partner);

    return {
      message: 'Category & Offered Services saved successfully',
      user: obj,
      nextStep: statusInfo.nextStep,
      onboardingStatus: statusInfo.onboardingStatus,
    };
  }

  // 6. STEP-WISE ONBOARDING METHOD 3: SKILLS & EXPERIENCE
  async saveOnboardingSkills(partnerId, { experience, skills, certifications }) {
    const partner = await userRepository.findById(partnerId);
    if (!partner || partner.role !== ROLES.PARTNER) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Partner account not found');
    }

    if (experience) partner.experience = experience;
    if (Array.isArray(skills)) {
      const validSkills = skills.filter(
        (s) => (typeof s === 'string' && Boolean(s.match(/^[0-9a-fA-F]{24}$/))) || (s && s._id)
      );
      partner.skills = validSkills;
    }

    if (Array.isArray(certifications)) partner.certifications = certifications;
    partner.isSkillsUpdated = true;

    await partner.save();

    const obj = partner.toObject();
    delete obj.password;
    delete obj.refreshToken;

    const statusInfo = getPartnerOnboardingStatus(partner);

    return {
      message: 'Skills & Experience saved successfully',
      user: obj,
      nextStep: statusInfo.nextStep,
      onboardingStatus: statusInfo.onboardingStatus,
    };
  }

  // 6. STEP-WISE ONBOARDING METHOD 4: SERVICE AREA
  async saveOnboardingServiceArea(partnerId, { workRadius, localities }) {
    const partner = await userRepository.findById(partnerId);
    if (!partner || partner.role !== ROLES.PARTNER) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Partner account not found');
    }

    if (workRadius) partner.workRadius = Number(workRadius);
    if (Array.isArray(localities)) partner.localities = localities;
    partner.isServiceAreaSet = true;

    await partner.save();

    const obj = partner.toObject();
    delete obj.password;
    delete obj.refreshToken;

    const statusInfo = getPartnerOnboardingStatus(partner);

    return {
      message: 'Service area saved successfully',
      user: obj,
      nextStep: statusInfo.nextStep,
      onboardingStatus: statusInfo.onboardingStatus,
    };
  }

  // 6. STEP-WISE ONBOARDING METHOD 5: WORKING HOURS & FINAL COMPLETE
  async saveOnboardingWorkingHours(partnerId, { workingHours }) {
    const partner = await userRepository.findById(partnerId);
    if (!partner || partner.role !== ROLES.PARTNER) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Partner account not found');
    }

    if (Array.isArray(workingHours)) partner.workingHours = workingHours;
    partner.isWorkingHoursSet = true;
    partner.isKycSubmitted = true;
    partner.kycStatus = 'pending'; // Application submitted for City Admin approval
    partner.isDocumentsUploaded = true;

    await partner.save();

    const obj = partner.toObject();
    delete obj.password;
    delete obj.refreshToken;

    const statusInfo = getPartnerOnboardingStatus(partner);

    return {
      message: 'Working hours saved & onboarding completed successfully',
      user: obj,
      nextStep: statusInfo.nextStep,
      onboardingStatus: statusInfo.onboardingStatus,
    };
  }

  // 7. SUBMIT FULL KYC & WORK SETUP (BULK FALLBACK)
  async submitKycSetup(partnerId, kycData) {
    const partner = await userRepository.findById(partnerId);
    if (!partner || partner.role !== ROLES.PARTNER) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Partner account not found');
    }

    const {
      documents = {},
      experience,
      skills,
      certifications,
      workRadius,
      localities,
      workingHours,
      category,
    } = kycData;

    const currentDocs = partner.documents ? partner.documents.toObject() : {};
    partner.documents = {
      ...currentDocs,
      ...documents,
    };

    if (experience) partner.experience = experience;
    if (Array.isArray(skills)) partner.skills = skills;
    if (Array.isArray(certifications)) partner.certifications = certifications;
    if (workRadius) partner.workRadius = Number(workRadius);
    if (Array.isArray(localities)) partner.localities = localities;
    if (Array.isArray(workingHours)) partner.workingHours = workingHours;
    if (category) partner.category = category;

    partner.isKycSubmitted = true;
    partner.kycStatus = 'pending';
    partner.isDocumentsUploaded = true;

    await partner.save();

    const obj = partner.toObject();
    delete obj.password;
    delete obj.refreshToken;

    const statusInfo = getPartnerOnboardingStatus(partner);

    return {
      message: 'KYC & Work setup submitted successfully. Application is under review by City Admin.',
      user: obj,
      kycStatus: partner.kycStatus,
      isKycSubmitted: partner.isKycSubmitted,
      nextStep: statusInfo.nextStep,
      onboardingStatus: statusInfo.onboardingStatus,
    };
  }


  // 7. GET KYC STATUS
  async getKycStatus(partnerId) {
    const partner = await userRepository.findById(partnerId);
    if (!partner || partner.role !== ROLES.PARTNER) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Partner account not found');
    }

    const isApproved = partner.kycStatus === 'approved';
    const statusInfo = getPartnerOnboardingStatus(partner);

    const onboardingStatus = isApproved
      ? {
        isPhoneVerified: true,
        isProfileCompleted: true,
        isLocationSaved: true,
        isDocumentsUploaded: true,
        isCategorySelected: true,
        isSkillsUpdated: true,
        isServiceAreaSet: true,
        isWorkingHoursSet: true,
        isAllCompleted: true,
        isKycSubmitted: true,
        kycStatus: 'approved',
      }
      : statusInfo.onboardingStatus;

    return {
      partnerId: partner._id,
      agencyName: partner.agencyName,
      name: partner.name,
      kycStatus: partner.kycStatus,
      isKycSubmitted: isApproved || partner.isKycSubmitted || statusInfo.onboardingStatus.isAllCompleted || false,
      isProfileCompleted: isApproved || statusInfo.onboardingStatus.isProfileCompleted,
      isDocumentsUploaded: isApproved || statusInfo.onboardingStatus.isDocumentsUploaded,
      isBookingUnlocked: isApproved,
      nextStep: isApproved ? 'DONE' : statusInfo.nextStep,
      onboardingStatus,
      documents: partner.documents,
      experience: partner.experience,
      skills: partner.skills,
      workRadius: partner.workRadius,
      localities: partner.localities,
      workingHours: partner.workingHours,
    };
  }

  // 8. ADD INDIVIDUAL CERTIFICATE (Upload photo/file to Cloudflare R2 & save to partner certifications array)
  async addCertification(partnerId, { title, file, image }) {
    const partner = await userRepository.findById(partnerId);
    if (!partner || partner.role !== ROLES.PARTNER) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Partner account not found');
    }

    let certUrl = '';
    if (file) {
      const res = await r2StorageService.uploadFile(file.buffer, file.originalname, file.mimetype, 'norozz_certifications');
      certUrl = res.url;
    } else if (image && typeof image === 'string' && image.startsWith('data:image')) {
      certUrl = await r2StorageService.uploadBase64Image(image, 'norozz_certifications');
    } else if (image && typeof image === 'string') {
      certUrl = image;
    }

    const certId = new mongoose.Types.ObjectId().toString();
    const newCert = {
      _id: certId,
      id: certId,
      title: (title || 'Professional Certificate').trim(),
      url: certUrl,
      image: certUrl,
      createdAt: new Date(),
    };

    const currentCerts = Array.isArray(partner.certifications) ? [...partner.certifications] : [];
    currentCerts.push(newCert);
    partner.certifications = currentCerts;

    await partner.save({ validateBeforeSave: false });

    const obj = partner.toObject();
    delete obj.password;
    delete obj.refreshToken;

    const statusInfo = getPartnerOnboardingStatus(partner);

    return {
      message: 'Certificate uploaded and saved successfully to database & Cloudflare R2.',
      certification: newCert,
      user: obj,
      nextStep: statusInfo.nextStep,
      onboardingStatus: statusInfo.onboardingStatus,
    };
  }

  // 9. DELETE CERTIFICATE (Remove certificate from partner certifications array by _id or index)
  async deleteCertification(partnerId, certId) {
    const partner = await userRepository.findById(partnerId);
    if (!partner || partner.role !== ROLES.PARTNER) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Partner account not found');
    }

    const currentCerts = Array.isArray(partner.certifications) ? partner.certifications : [];
    const updatedCerts = currentCerts.filter((c, idx) => {
      if (typeof c === 'object' && c !== null) {
        const idStr = String(c._id || c.id || '');
        return idStr !== String(certId) && String(idx) !== String(certId);
      }
      return String(idx) !== String(certId) && String(c) !== String(certId);
    });

    partner.certifications = updatedCerts;
    await partner.save({ validateBeforeSave: false });

    const obj = partner.toObject();
    delete obj.password;
    delete obj.refreshToken;

    const statusInfo = getPartnerOnboardingStatus(partner);

    return {
      message: 'Certificate deleted successfully from partner profile.',
      user: obj,
      nextStep: statusInfo.nextStep,
      onboardingStatus: statusInfo.onboardingStatus,
    };
  }

  // 10. GET ONBOARDING FEE CONFIGURATION
  async getOnboardingFee() {
    const { SystemSettings } = await import('../models/systemSettings.model.js');
    const settings = await SystemSettings.findOne({ key: 'global_settings' });
    const fee = settings?.partnerOnboardingFee ?? 999;
    const baseFee = Math.round((fee / 1.18) * 100) / 100;
    const gstFee = Math.round((fee - baseFee) * 100) / 100;

    return {
      totalAmount: fee,
      baseRegistrationFee: baseFee,
      gstAmount: gstFee,
      currency: settings?.currency || 'INR',
      whatsIncluded: [
        {
          id: 1,
          title: 'Background & Document Verification',
          description: 'Secure background check and government database verification.',
        },
        {
          id: 2,
          title: 'Professional Skill Certification',
          description: 'Digital badge and service certificate to boost customer trust.',
        },
        {
          id: 3,
          title: 'Partner Training & Support',
          description: 'Access to training modules and priority 24/7 partner support.',
        },
      ],
    };
  }

  // 11. PROCESS PARTNER ONBOARDING FEE PAYMENT
  async payOnboardingFee(partnerId, paymentDetails = {}) {
    const partner = await userRepository.findById(partnerId);
    if (!partner || partner.role !== ROLES.PARTNER) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Partner account not found');
    }

    const { SystemSettings } = await import('../models/systemSettings.model.js');
    const settings = await SystemSettings.findOne({ key: 'global_settings' });
    const fee = settings?.partnerOnboardingFee ?? 999;

    partner.isOnboardingFeePaid = true;
    partner.onboardingFeeAmount = fee;
    partner.onboardingPaymentStatus = 'completed';
    partner.onboardingPaymentId = paymentDetails.paymentId || `PAY-ONB-${Math.floor(100000 + Math.random() * 900000)}`;
    partner.onboardingPaymentDate = new Date();
    partner.isKycSubmitted = true;

    await partner.save({ validateBeforeSave: false });

    // Record transaction log in WalletTransaction
    try {
      const { WalletTransaction } = await import('../models/walletTransaction.model.js');
      const txnId = `TXN-ONB-${Math.floor(100000 + Math.random() * 900000)}`;
      await WalletTransaction.create({
        transactionId: txnId,
        partnerId: partner._id,
        type: 'Debit',
        category: 'Added to Wallet',
        title: 'One-Time Partner Account Onboarding & Registration Fee',
        amount: fee,
        status: 'Completed',
      });
    } catch (txnErr) {
      console.warn('Onboarding fee wallet transaction log notice:', txnErr);
    }

    const obj = partner.toObject();
    delete obj.password;
    delete obj.refreshToken;

    const statusInfo = getPartnerOnboardingStatus(partner);

    return {
      message: `₹${fee} One-Time Onboarding Fee paid successfully! Account registration complete.`,
      user: obj,
      nextStep: statusInfo.nextStep,
      onboardingStatus: statusInfo.onboardingStatus,
      paymentDetails: {
        amount: fee,
        paymentId: partner.onboardingPaymentId,
        paymentDate: partner.onboardingPaymentDate,
        status: 'completed',
      },
    };
  }
}

export const partnerAuthService = new PartnerAuthService();
