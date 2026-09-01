import { BaseController } from './base.controller.js';
import { customerAuthService } from '../services/customerAuth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export class CustomerAuthController extends BaseController {

  setCookie(res, refreshToken) {
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  signup = asyncHandler(async (req, res) => {
    const result = await customerAuthService.signup(req.body);
    this.setCookie(res, result.refreshToken);
    return this.sendCreated(res, result, 'Customer account created successfully');
  });

  login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const result = await customerAuthService.login(email, password);
    this.setCookie(res, result.refreshToken);
    return this.sendSuccess(res, result, 'Customer login successful');
  });

  requestOtpLogin = asyncHandler(async (req, res) => {
    const { emailOrPhone } = req.body;
    const result = await customerAuthService.requestOtpLogin(emailOrPhone);
    return this.sendSuccess(res, result, result.message);
  });

  verifyOtpLogin = asyncHandler(async (req, res) => {
    const { emailOrPhone, otp } = req.body;
    const result = await customerAuthService.verifyOtpLogin(emailOrPhone, otp);
    this.setCookie(res, result.refreshToken);
    return this.sendSuccess(res, result, 'OTP login successful');
  });

  sendSecondaryOtp = asyncHandler(async (req, res) => {
    const { emailOrPhone } = req.body;
    const result = await customerAuthService.sendSecondaryOtp(req.user._id, emailOrPhone);
    return this.sendSuccess(res, result, result.message);
  });

  verifySecondaryOtp = asyncHandler(async (req, res) => {
    const { emailOrPhone, otp } = req.body;
    const result = await customerAuthService.verifySecondaryOtp(req.user._id, emailOrPhone, otp);
    return this.sendSuccess(res, result, result.message);
  });

  forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const result = await customerAuthService.forgotPassword(email);
    return this.sendSuccess(res, result, 'Password reset OTP generated successfully');
  });

  resetPassword = asyncHandler(async (req, res) => {
    const { email, otp, newPassword } = req.body;
    const result = await customerAuthService.resetPassword(email, otp, newPassword);
    return this.sendSuccess(res, result, result.message);
  });

  logout = asyncHandler(async (req, res) => {
    res.clearCookie('refreshToken');
    return this.sendSuccess(res, null, 'Customer logged out successfully');
  });

  refreshToken = asyncHandler(async (req, res) => {
    const token = req.cookies?.refreshToken || req.body.refreshToken;
    const result = await customerAuthService.refreshToken(token);
    return this.sendSuccess(res, result, 'Access Token refreshed successfully');
  });

  getProfile = asyncHandler(async (req, res) => {
    const profile = await customerAuthService.getProfile(req.user._id);
    return this.sendSuccess(res, profile, 'Customer profile retrieved successfully');
  });

  updateProfile = asyncHandler(async (req, res) => {
    const file = req.file || req.files?.profileImage?.[0];
    const updated = await customerAuthService.updateProfile(req.user._id, req.body, file);
    return this.sendSuccess(res, updated, 'Customer profile updated successfully');
  });

  addAddress = asyncHandler(async (req, res) => {
    const result = await customerAuthService.addAddress(req.user._id, req.body);
    return this.sendCreated(res, result, result.message);
  });

  getAddresses = asyncHandler(async (req, res) => {
    const addresses = await customerAuthService.getAddresses(req.user._id);
    return this.sendSuccess(res, addresses, 'Customer addresses retrieved successfully');
  });

  updateAddress = asyncHandler(async (req, res) => {
    const result = await customerAuthService.updateAddress(req.user._id, req.params.addressId, req.body);
    return this.sendSuccess(res, result, result.message);
  });

  deleteAddress = asyncHandler(async (req, res) => {
    const result = await customerAuthService.deleteAddress(req.user._id, req.params.addressId);
    return this.sendSuccess(res, result, result.message);
  });
}

export const customerAuthController = new CustomerAuthController();
