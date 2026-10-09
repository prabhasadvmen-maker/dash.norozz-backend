import { userRepository } from '../repositories/user.repository.js';
import { otpRepository } from '../repositories/otp.repository.js';
import { verifyRefreshToken } from '../helpers/jwt.helper.js';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { ROLES } from '../constants/roles.constant.js';

export class AuthService {
  // Token Generator using User Model instance methods
  async generateTokens(user) {
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const userObject = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    };

    return { user: userObject, accessToken, refreshToken };
  }

  // 1. CUSTOMER AUTHENTICATION FLOWS
  async customerSignup(userData) {
    const existing = await userRepository.findByEmail(userData.email);
    if (existing) {
      throw new ApiError(HTTP_STATUS.CONFLICT, 'Customer account with this email already exists');
    }

    const newCustomer = await userRepository.create({
      ...userData,
      role: ROLES.CUSTOMER,
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    return await this.generateTokens(newCustomer);
  }

  async customerLogin(email, password) {
    const user = await userRepository.findByEmail(email, true);
    if (!user || (user.role !== ROLES.CUSTOMER && user.role !== 'customer')) {
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

  async customerRefreshToken(refreshToken) {
    if (!refreshToken) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Refresh token missing');
    }

    try {
      const decoded = verifyRefreshToken(refreshToken);
      const user = await userRepository.findById(decoded.id, '+refreshToken');

      if (!user || user.refreshToken !== refreshToken) {
        throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Invalid or expired refresh token');
      }

      return { accessToken: user.generateAccessToken() };
    } catch (error) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Expired or invalid refresh token');
    }
  }

  async customerForgotPassword(email) {
    const user = await userRepository.findByEmail(email);
    if (!user) {
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

    return { email, otp: generatedOtp, message: 'OTP sent to registered email' };
  }

  async customerResetPassword(email, otp, newPassword) {
    const validOtp = await otpRepository.findLatestValidOtp(email, 'resetPassword');
    if (!validOtp || validOtp.otp !== otp) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid or expired OTP code');
    }

    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'User not found');
    }

    user.password = newPassword;
    await user.save();

    await otpRepository.markAsVerified(validOtp._id);

    return { message: 'Password reset successfully. Please sign in with your new password.' };
  }

  // 2. PARTNER AUTHENTICATION FLOWS
  async partnerSignup(partnerData) {
    const existing = await userRepository.findByEmail(partnerData.email);
    if (existing) {
      throw new ApiError(HTTP_STATUS.CONFLICT, 'Partner account with this email already exists');
    }

    const newPartner = await userRepository.create({
      ...partnerData,
      role: ROLES.PARTNER,
      kycStatus: 'pending',
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    return await this.generateTokens(newPartner);
  }

  async partnerLogin(email, password) {
    const user = await userRepository.findByEmail(email, true);
    if (!user || user.role !== ROLES.PARTNER) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Invalid partner credentials');
    }

    const isMatch = await user.isPasswordCorrect(password);
    if (!isMatch) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Invalid partner credentials');
    }

    if (user.status === 'blocked' || user.status === 'disabled') {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Partner account is blocked/disabled');
    }

    return await this.generateTokens(user);
  }

  // 3. CITY ADMIN LOGIN FLOW
  async cityAdminLogin(email, password) {
    const user = await userRepository.findByEmail(email, true);
    if (!user || (user.role !== ROLES.CITY_ADMIN && user.role !== ROLES.ADMIN)) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Invalid City Admin credentials');
    }

    const isMatch = await user.isPasswordCorrect(password);
    if (!isMatch) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Invalid City Admin credentials');
    }

    if (user.status === 'blocked' || user.status === 'disabled') {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'City Admin account is blocked/disabled');
    }

    return await this.generateTokens(user);
  }

  // 4. SUPER ADMIN LOGIN FLOW
  async superAdminLogin(email, password) {
    const user = await userRepository.findByEmail(email, true);
    if (!user || user.role !== ROLES.SUPER_ADMIN) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Invalid Super Admin credentials');
    }

    const isMatch = await user.isPasswordCorrect(password);
    if (!isMatch) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Invalid Super Admin credentials');
    }

    return await this.generateTokens(user);
  }
}

export const authService = new AuthService();
