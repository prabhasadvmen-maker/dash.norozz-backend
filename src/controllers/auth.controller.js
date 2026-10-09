import { BaseController } from './base.controller.js';
import { authService } from '../services/auth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export class AuthController extends BaseController {

  // Cookie Helpers
  setAccessTokenCookie(res, accessToken) {
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });
  }

  setRefreshTokenCookie(res, refreshToken) {
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }

  // 1. CUSTOMER HANDLERS
  customerSignup = asyncHandler(async (req, res) => {
    const result = await authService.customerSignup(req.body);
    this.setAccessTokenCookie(res, result.accessToken);
    this.setRefreshTokenCookie(res, result.refreshToken);
    return this.sendCreated(res, { user: result.user }, 'Customer account created successfully');
  });

  customerLogin = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const result = await authService.customerLogin(email, password);
    this.setAccessTokenCookie(res, result.accessToken);
    this.setRefreshTokenCookie(res, result.refreshToken);
    return this.sendSuccess(res, { user: result.user, accessToken: result.accessToken }, 'Customer login successful');
  });

  customerLogout = asyncHandler(async (req, res) => {
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    return this.sendSuccess(res, null, 'Customer logged out successfully');
  });

  customerRefreshToken = asyncHandler(async (req, res) => {
    const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;
    const result = await authService.customerRefreshToken(refreshToken);
    this.setAccessTokenCookie(res, result.accessToken);
    return this.sendSuccess(res, { accessToken: result.accessToken }, 'Access Token refreshed successfully');
  });

  customerForgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const result = await authService.customerForgotPassword(email);
    return this.sendSuccess(res, result, 'Password reset OTP generated successfully');
  });

  customerResetPassword = asyncHandler(async (req, res) => {
    const { email, otp, newPassword } = req.body;
    const result = await authService.customerResetPassword(email, otp, newPassword);
    return this.sendSuccess(res, result, 'Password reset successfully');
  });

  // 2. PARTNER HANDLERS
  partnerSignup = asyncHandler(async (req, res) => {
    const result = await authService.partnerSignup(req.body);
    this.setAccessTokenCookie(res, result.accessToken);
    this.setRefreshTokenCookie(res, result.refreshToken);
    return this.sendCreated(res, { user: result.user, accessToken: result.accessToken }, 'Partner onboarding application submitted successfully');
  });

  partnerLogin = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const result = await authService.partnerLogin(email, password);
    this.setAccessTokenCookie(res, result.accessToken);
    this.setRefreshTokenCookie(res, result.refreshToken);
    return this.sendSuccess(res, { user: result.user, accessToken: result.accessToken }, 'Partner login successful');
  });

  partnerLogout = asyncHandler(async (req, res) => {
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    return this.sendSuccess(res, null, 'Partner logged out successfully');
  });

  // 3. CITY ADMIN HANDLER
  cityAdminLogin = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const result = await authService.cityAdminLogin(email, password);
    this.setAccessTokenCookie(res, result.accessToken);
    this.setRefreshTokenCookie(res, result.refreshToken);
    return this.sendSuccess(res, { user: result.user, accessToken: result.accessToken }, 'City Admin login successful');
  });

  // 4. SUPER ADMIN HANDLER
  superAdminLogin = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const result = await authService.superAdminLogin(email, password);
    this.setAccessTokenCookie(res, result.accessToken);
    this.setRefreshTokenCookie(res, result.refreshToken);
    return this.sendSuccess(res, { user: result.user, accessToken: result.accessToken }, 'Super Admin login successful');
  });
}

export const authController = new AuthController();
