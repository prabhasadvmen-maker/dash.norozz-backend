import { userRepository } from '../repositories/user.repository.js';
import { otpRepository } from '../repositories/otp.repository.js';
import { verifyRefreshToken } from '../helpers/jwt.helper.js';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { ROLES } from '../constants/roles.constant.js';
import { notificationService } from './notificationService.js';
import { storageService } from './storage.service.js';
import { r2StorageService } from './r2Storage.service.js';
import { normalizePhoneNumber } from '../utils/phone.util.js';
import { OTP_WINDOW_MS, OTP_MAX_PER_WINDOW, OTP_COOLDOWN_SEC } from '../middleware/rateLimiter.middleware.js';

export class CustomerAuthService {

  // Token Generator Helper
  async generateTokens(user) {
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const userObj = user.toObject();
    delete userObj.password;
    delete userObj.refreshToken;

    return { user: userObj, accessToken, refreshToken };
  }

  // 1. SIGNUP
  async signup(customerData) {
    const existing = await userRepository.findByEmail(customerData.email);
    if (existing) {
      throw new ApiError(HTTP_STATUS.CONFLICT, 'Customer account with this email already exists');
    }

    const newCustomer = await userRepository.create({
      ...customerData,
      role: ROLES.CUSTOMER,
      status: 'active',
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    return await this.generateTokens(newCustomer);
  }

  // 2. PASSWORD LOGIN
  async login(email, password) {
    const user = await userRepository.findByEmail(email, true);
    if (!user || user.role !== ROLES.CUSTOMER) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Invalid customer credentials');
    }

    const isMatch = await user.isPasswordCorrect(password);
    if (!isMatch) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Invalid customer credentials');
    }

    if (user.status === 'blocked' || user.status === 'disabled') {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Customer account is blocked/disabled');
    }

    return await this.generateTokens(user);
  }

  // 3. OTP LOGIN (REQUEST & VERIFY)
  async requestOtpLogin(emailOrPhone) {
    const normalizedInput = emailOrPhone && !emailOrPhone.includes('@') ? normalizePhoneNumber(emailOrPhone) : emailOrPhone;
    const existingUser = await userRepository.findByEmailOrPhone(normalizedInput);
    if (existingUser && existingUser.role !== ROLES.CUSTOMER) {
      const roleName = existingUser.role === ROLES.PARTNER ? 'Partner' : 'Admin';
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        `This email/phone is registered as a ${roleName} account. Please use the ${roleName} Portal to log in.`
      );
    }

    const recentCount = await otpRepository.countRecentOtps(normalizedInput, 'login', OTP_WINDOW_MS);
    if (recentCount >= OTP_MAX_PER_WINDOW) {
      throw new ApiError(
        HTTP_STATUS.TOO_MANY_REQUESTS,
        `OTP limit reached. Maximum ${OTP_MAX_PER_WINDOW} OTPs allowed per 10 minutes. Please try again later.`
      );
    }

    const recentOtp = await otpRepository.findRecentOtp(normalizedInput, 'login', OTP_COOLDOWN_SEC);
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
      emailOrPhone: normalizedInput,
      otp: generatedOtp,
      type: 'login',
      expiresAt,
    });

    // Dispatch Email OTP via Brevo or Mobile SMS OTP
    await notificationService.dispatchOtp(normalizedInput, generatedOtp);

    return { emailOrPhone: normalizedInput, message: 'OTP sent successfully for instant login' };
  }

  async verifyOtpLogin(emailOrPhone, otp) {
    const normalizedInput = emailOrPhone && !emailOrPhone.includes('@') ? normalizePhoneNumber(emailOrPhone) : emailOrPhone;
    const validOtp = await otpRepository.findLatestValidOtp(normalizedInput, 'login');
    if (!validOtp || validOtp.otp !== otp) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid or expired OTP code');
    }

    let isNewUser = false;
    let user = await userRepository.findByEmailOrPhone(normalizedInput);
    if (user && user.role !== ROLES.CUSTOMER) {
      const roleName = user.role === ROLES.PARTNER ? 'Partner' : 'Admin';
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        `This account is registered as a ${roleName}. Please use the ${roleName} Portal to log in.`
      );
    }

    if (!user) {
      isNewUser = true;
      const cleanId = normalizedInput.trim();
      const isEmail = cleanId.includes('@');
      const cleanDigits = !isEmail ? cleanId.replace(/\D/g, '').slice(-6) : Math.floor(100000 + Math.random() * 900000);
      const generatedUserId = `NRZ-C-${cleanDigits}`;

      user = await userRepository.create({
        userId: generatedUserId,
        name: '',
        email: isEmail ? cleanId.toLowerCase() : '',
        phone: !isEmail ? cleanId : '',
        password: (await import('crypto')).randomBytes(16).toString('hex'),
        role: ROLES.CUSTOMER,
        city: '',
        status: 'active',
        isEmailVerified: isEmail,
        isPhoneVerified: !isEmail,
        isProfileCompleted: false,
      });
    } else {
      if (!user.userId) {
        const cleanDigits = user.phone ? user.phone.replace(/\D/g, '').slice(-6) : Math.floor(100000 + Math.random() * 900000);
        user.userId = `NRZ-C-${cleanDigits}`;
      }
      if (user.name && (user.name.startsWith('Customer ') || user.name.startsWith('user_'))) user.name = '';
      if (user.email && user.email.startsWith('user_') && user.email.endsWith('@norozz.com')) user.email = '';
      if (user.city === 'Delhi NCR' && !user.isProfileCompleted) user.city = '';

      const hasName = Boolean(user.name && user.name.trim() && !user.name.startsWith('Customer ') && !user.name.startsWith('user_'));
      const hasContact = Boolean((user.email && !user.email.endsWith('@norozz.com')) || user.phone);

      const isProfileComplete = Boolean(user.isProfileCompleted || (hasName && hasContact));

      if (!isProfileComplete) {
        isNewUser = true;
      } else {
        isNewUser = false;
        if (!user.isProfileCompleted) {
          user.isProfileCompleted = true;
          await user.save();
        }
      }
    }

    await otpRepository.markAsVerified(validOtp._id);

    const authResult = await this.generateTokens(user);
    return { ...authResult, isNewUser, isProfileCompleted: !isNewUser };
  }

  // 3b. SECONDARY OTP (VERIFY SECOND IDENTIFIER - PHONE FOR EMAIL USERS / EMAIL FOR PHONE USERS)
  async sendSecondaryOtp(customerId, emailOrPhone) {
    const cleanId = emailOrPhone.trim();
    const isEmail = cleanId.includes('@');

    const recentCount = await otpRepository.countRecentOtps(cleanId, 'secondaryVerify', OTP_WINDOW_MS);
    if (recentCount >= OTP_MAX_PER_WINDOW) {
      throw new ApiError(
        HTTP_STATUS.TOO_MANY_REQUESTS,
        `OTP limit reached. Maximum ${OTP_MAX_PER_WINDOW} OTPs allowed per 10 minutes. Please try again later.`
      );
    }

    const recentOtp = await otpRepository.findRecentOtp(cleanId, 'secondaryVerify', OTP_COOLDOWN_SEC);
    if (recentOtp) {
      throw new ApiError(
        HTTP_STATUS.TOO_MANY_REQUESTS,
        `OTP already sent. Please wait ${OTP_COOLDOWN_SEC} seconds before requesting again.`
      );
    }

    const currentUser = await userRepository.findById(customerId);
    if (!currentUser) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Customer account not found');
    }

    if (isEmail) {
      const cleanEmail = cleanId.toLowerCase();
      const userEmail = currentUser.email ? currentUser.email.toLowerCase() : '';
      if (userEmail !== cleanEmail) {
        const existing = await userRepository.findByEmail(cleanEmail);
        if (existing && existing._id.toString() !== customerId.toString()) {
          throw new ApiError(HTTP_STATUS.CONFLICT, 'This email address is already registered to another account.');
        }
      }
    } else {
      const cleanPhoneNorm = normalizePhoneNumber(cleanId);
      const userPhoneNorm = currentUser.phone ? normalizePhoneNumber(currentUser.phone) : '';
      if (!userPhoneNorm || userPhoneNorm !== cleanPhoneNorm) {
        const existing = await userRepository.findByPhone(cleanId);
        if (existing && existing._id.toString() !== customerId.toString()) {
          throw new ApiError(HTTP_STATUS.CONFLICT, 'This mobile phone number is already registered to another account.');
        }
      }
    }

    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await otpRepository.create({
      emailOrPhone: cleanId,
      otp: generatedOtp,
      type: 'secondaryVerify',
      expiresAt,
    });

    await notificationService.dispatchOtp(cleanId, generatedOtp);
    return { emailOrPhone: cleanId, message: `Verification OTP sent to ${cleanId}` };
  }

  async verifySecondaryOtp(customerId, emailOrPhone, otp) {
    const cleanId = emailOrPhone.trim();
    const isEmail = cleanId.includes('@');

    const validOtp = await otpRepository.findLatestValidOtp(cleanId, 'secondaryVerify');
    if (!validOtp || validOtp.otp !== otp) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid or expired OTP code');
    }

    const user = await userRepository.findById(customerId);
    if (!user) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Customer account not found');

    if (isEmail) {
      user.email = cleanId.toLowerCase();
      user.isEmailVerified = true;
    } else {
      user.phone = cleanId;
      user.isPhoneVerified = true;
    }

    await user.save();
    await otpRepository.markAsVerified(validOtp._id);

    const obj = user.toObject();
    delete obj.password;
    delete obj.refreshToken;

    return { message: `${isEmail ? 'Email' : 'Phone number'} verified successfully`, user: obj };
  }

  // 4. FORGOT & RESET PASSWORD
  async forgotPassword(email) {
    const recentCount = await otpRepository.countRecentOtps(email, 'resetPassword', OTP_WINDOW_MS);
    if (recentCount >= OTP_MAX_PER_WINDOW) {
      throw new ApiError(
        HTTP_STATUS.TOO_MANY_REQUESTS,
        `OTP limit reached. Maximum ${OTP_MAX_PER_WINDOW} OTPs allowed per 10 minutes. Please try again later.`
      );
    }

    const recentOtp = await otpRepository.findRecentOtp(email, 'resetPassword', OTP_COOLDOWN_SEC);
    if (recentOtp) {
      throw new ApiError(
        HTTP_STATUS.TOO_MANY_REQUESTS,
        `OTP already sent. Please wait ${OTP_COOLDOWN_SEC} seconds before requesting again.`
      );
    }

    const user = await userRepository.findByEmail(email);
    if (!user || user.role !== ROLES.CUSTOMER) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'No customer account found with this email');
    }

    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await otpRepository.create({
      emailOrPhone: email,
      otp: generatedOtp,
      type: 'resetPassword',
      expiresAt,
    });

    // Send Reset Password Email via Brevo
    await notificationService.sendEmailOtp(email, generatedOtp);

    return { email, message: 'Password reset OTP sent to registered email' };
  }

  async resetPassword(email, otp, newPassword) {
    const validOtp = await otpRepository.findLatestValidOtp(email, 'resetPassword');
    if (!validOtp || validOtp.otp !== otp) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid or expired OTP code');
    }

    const user = await userRepository.findByEmail(email);
    if (!user || user.role !== ROLES.CUSTOMER) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Customer user not found');
    }

    user.password = newPassword;
    await user.save();
    await otpRepository.markAsVerified(validOtp._id);

    return { message: 'Customer password reset successfully' };
  }

  // 5. REFRESH TOKEN
  async refreshToken(token) {
    if (!token) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Refresh token missing');
    }

    try {
      const decoded = verifyRefreshToken(token);
      const user = await userRepository.findById(decoded.id, '+refreshToken');

      if (!user || user.refreshToken !== token) {
        throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Invalid or expired refresh token');
      }

      const newAccessToken = user.generateAccessToken();
      return { accessToken: newAccessToken };
    } catch (error) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Expired or invalid refresh token');
    }
  }

  // 6. PROFILE & ADDRESS CRUD
  async getProfile(customerId) {
    const user = await userRepository.findById(customerId);
    const obj = user.toObject();
    delete obj.password;
    return obj;
  }

  async updateProfile(customerId, updateData, file = null) {
    const allowedFields = ['name', 'email', 'phone', 'dob', 'gender', 'profileImage', 'city', 'state', 'country', 'address', 'isProfileCompleted', 'isEmailVerified', 'isPhoneVerified', 'referredBy', 'usedReferralCode'];
    const sanitizedData = {};

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        sanitizedData[field] = updateData[field];
      }
    }

    const { User } = await import('../models/user.model.js');
    const inputRefCode = updateData.referredBy || updateData.usedReferralCode || updateData.referralCodeUsed;
    if (inputRefCode) {
      const cleanRefCode = String(inputRefCode).trim().toUpperCase();
      const referrer = await User.findOne({ referralCode: cleanRefCode });
      if (referrer && referrer._id.toString() !== customerId.toString()) {
        sanitizedData.referredBy = cleanRefCode;
        sanitizedData.referredByPartner = referrer._id;
      }
    }

    if (sanitizedData.name && sanitizedData.name.trim()) {
      sanitizedData.isProfileCompleted = true;
    }

    // Upload profile image binary file to Cloudflare R2
    if (file) {
      const uploadRes = await r2StorageService.uploadFile(
        file.buffer,
        file.originalname || 'customer_profile.jpg',
        file.mimetype || 'image/jpeg',
        'norozz_customer_profiles'
      );
      sanitizedData.profileImage = uploadRes.url || uploadRes;
    } else if (sanitizedData.profileImage && sanitizedData.profileImage.startsWith('data:image')) {
      sanitizedData.profileImage = await r2StorageService.uploadBase64Image(sanitizedData.profileImage, 'norozz_customer_profiles');
    }

    // Check duplicate email across accounts
    if (sanitizedData.email) {
      const cleanEmail = sanitizedData.email.trim().toLowerCase();
      const existingUser = await userRepository.findByEmail(cleanEmail);
      if (existingUser && existingUser._id.toString() !== customerId.toString()) {
        throw new ApiError(HTTP_STATUS.CONFLICT, 'This email address is already linked to another account');
      }
    }

    // Check duplicate phone across accounts
    if (sanitizedData.phone) {
      const cleanPhone = sanitizedData.phone.trim();
      const existingUser = await userRepository.findByPhone(cleanPhone);
      if (existingUser && existingUser._id.toString() !== customerId.toString()) {
        throw new ApiError(HTTP_STATUS.CONFLICT, 'This mobile phone number is already linked to another account');
      }
    }

    const updated = await userRepository.updateById(customerId, sanitizedData);
    if (!updated) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Customer user not found');
    }
    const obj = updated.toObject();
    delete obj.password;
    delete obj.refreshToken;
    return obj;
  }

  async addAddress(customerId, addressData) {
    const user = await userRepository.findById(customerId);
    if (!user) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Customer not found');

    const formatted = {
      title: addressData.title || addressData.label || 'Home',
      addressLine: addressData.addressLine || addressData.street || addressData.address || 'Saved Address Location',
      city: addressData.city || 'Mumbai',
      state: addressData.state || 'Maharashtra',
      pincode: addressData.pincode || addressData.zipCode || '400053',
      isDefault: Boolean(addressData.isDefault || user.addresses.length === 0),
    };

    if (formatted.isDefault) {
      user.addresses.forEach(a => { a.isDefault = false; });
    }

    user.addresses.push(formatted);

    // Also update main user.address for instant profile compatibility
    user.address = formatted.addressLine;
    user.city = formatted.city;

    await user.save();

    return { message: 'Address added successfully', addresses: user.addresses };
  }

  async getAddresses(customerId) {
    const user = await userRepository.findById(customerId);
    return user.addresses || [];
  }

  async updateAddress(customerId, addressId, updateData) {
    const user = await userRepository.findById(customerId);
    if (!user) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Customer not found');

    const addr = user.addresses.id(addressId);
    if (!addr) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Address record not found');

    const formatted = {
      title: updateData.title || updateData.label || addr.title,
      addressLine: updateData.addressLine || updateData.street || updateData.address || addr.addressLine,
      city: updateData.city || addr.city,
      state: updateData.state || addr.state,
      pincode: updateData.pincode || updateData.zipCode || addr.pincode,
      isDefault: updateData.isDefault !== undefined ? Boolean(updateData.isDefault) : addr.isDefault,
    };

    if (formatted.isDefault) {
      user.addresses.forEach(a => { a.isDefault = false; });
    }

    Object.assign(addr, formatted);
    await user.save();

    return { message: 'Address updated successfully', addresses: user.addresses };
  }

  async deleteAddress(customerId, addressId) {
    const user = await userRepository.findById(customerId);
    if (!user) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Customer not found');

    user.addresses.pull({ _id: addressId });
    await user.save();

    return { message: 'Address deleted successfully', addresses: user.addresses };
  }
}

export const customerAuthService = new CustomerAuthService();
