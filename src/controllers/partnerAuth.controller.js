import { BaseController } from './base.controller.js';
import { partnerAuthService } from '../services/partnerAuth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export class PartnerAuthController extends BaseController {

  setCookie(res, refreshToken) {
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  signup = asyncHandler(async (req, res) => {
    const result = await partnerAuthService.signup(req.body);
    this.setCookie(res, result.refreshToken);
    return this.sendCreated(res, result, 'Partner agency onboarding application created. Status: PENDING KYC.');
  });

  login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const result = await partnerAuthService.login(email, password);
    this.setCookie(res, result.refreshToken);
    return this.sendSuccess(res, result, 'Partner login successful');
  });

  requestOtpLogin = asyncHandler(async (req, res) => {
    const { phone } = req.body;
    const result = await partnerAuthService.requestOtpLogin(phone);
    return this.sendSuccess(res, result, 'OTP sent to mobile number');
  });

  verifyOtpLogin = asyncHandler(async (req, res) => {
    const { phone, otp } = req.body;
    const result = await partnerAuthService.verifyOtpLogin(phone, otp);
    this.setCookie(res, result.refreshToken);
    return this.sendSuccess(res, result, 'Partner OTP verified successfully');
  });

  updateProfile = asyncHandler(async (req, res) => {
    const result = await partnerAuthService.updateProfile(req.user._id, req.body);
    return this.sendSuccess(res, result, 'Partner profile updated successfully');
  });


  logout = asyncHandler(async (req, res) => {
    res.clearCookie('refreshToken');
    return this.sendSuccess(res, null, 'Partner logged out successfully');
  });

  forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const result = await partnerAuthService.forgotPassword(email);
    return this.sendSuccess(res, result, 'Password reset OTP generated successfully');
  });

  resetPassword = asyncHandler(async (req, res) => {
    const { email, otp, newPassword } = req.body;
    const result = await partnerAuthService.resetPassword(email, otp, newPassword);
    return this.sendSuccess(res, result, result.message);
  });

  uploadDocuments = asyncHandler(async (req, res) => {
    const result = await partnerAuthService.uploadDocuments(req.user._id, req.files || {});
    return this.sendSuccess(res, result, result.message);
  });

  saveOnboardingLocation = asyncHandler(async (req, res) => {
    const result = await partnerAuthService.saveOnboardingLocation(req.user._id, req.body);
    return this.sendSuccess(res, result, result.message);
  });

  saveOnboardingDocuments = asyncHandler(async (req, res) => {
    if (req.files && Object.keys(req.files).length > 0) {
      const result = await partnerAuthService.uploadDocuments(req.user._id, req.files);
      return this.sendSuccess(res, result, result.message);
    }
    const result = await partnerAuthService.saveOnboardingDocuments(req.user._id, req.body.documents || req.body);
    return this.sendSuccess(res, result, result.message);
  });

  saveOnboardingCategory = asyncHandler(async (req, res) => {
    const result = await partnerAuthService.saveOnboardingCategory(req.user._id, req.body);
    return this.sendSuccess(res, result, result.message);
  });

  saveOnboardingSkills = asyncHandler(async (req, res) => {
    const result = await partnerAuthService.saveOnboardingSkills(req.user._id, req.body);
    return this.sendSuccess(res, result, result.message);
  });

  saveOnboardingServiceArea = asyncHandler(async (req, res) => {
    const result = await partnerAuthService.saveOnboardingServiceArea(req.user._id, req.body);
    return this.sendSuccess(res, result, result.message);
  });

  saveOnboardingWorkingHours = asyncHandler(async (req, res) => {
    const result = await partnerAuthService.saveOnboardingWorkingHours(req.user._id, req.body);
    return this.sendSuccess(res, result, result.message);
  });

  submitKycSetup = asyncHandler(async (req, res) => {
    const result = await partnerAuthService.submitKycSetup(req.user._id, req.body);
    return this.sendSuccess(res, result, result.message);
  });

  getKycStatus = asyncHandler(async (req, res) => {
    const result = await partnerAuthService.getKycStatus(req.user._id);
    return this.sendSuccess(res, result, 'Partner KYC Status retrieved successfully');
  });

  addCertification = asyncHandler(async (req, res) => {
    const result = await partnerAuthService.addCertification(req.user._id, {
      title: req.body.title,
      file: req.file,
      image: req.body.image,
    });
    return this.sendSuccess(res, result, result.message);
  });

  deleteCertification = asyncHandler(async (req, res) => {
    const result = await partnerAuthService.deleteCertification(req.user._id, req.params.certId);
    return this.sendSuccess(res, result, result.message);
  });
}

export const partnerAuthController = new PartnerAuthController();
