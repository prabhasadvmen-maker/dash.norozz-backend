import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { ROLES } from '../constants/roles.constant.js';

/**
 * Middleware to enforce KYC approval lock on Partner accounts
 */
export const requireApprovedKyc = (req, res, next) => {
  if (!req.user) {
    throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Authentication required');
  }

  // If user is a Partner, verify status === 'active' and kycStatus === 'approved'
  if (req.user.role === ROLES.PARTNER) {
    if (req.user.status !== 'active') {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        `Your account is disabled/suspended (${req.user.status.toUpperCase()}). Booking features are locked. Please contact City Admin to reactivate your account.`
      );
    }
    if (req.user.kycStatus !== 'approved') {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        `KYC verification required. Your account status is currently '${req.user.kycStatus.toUpperCase()}'. Booking features are locked until City Admin approves your documents.`
      );
    }
  }

  next();
};
