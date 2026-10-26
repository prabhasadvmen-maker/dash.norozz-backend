import { verifyAccessToken } from '../helpers/jwt.helper.js';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { ROLES } from '../constants/roles.constant.js';
import { User } from '../models/user.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Verify JWT Access Token in Authorization header or Cookies
 */
export const verifyJWT = asyncHandler(async (req, res, next) => {
  const token =
    req.header('Authorization')?.replace('Bearer ', '') ||
    req.cookies?.accessToken;

  if (!token) {
    throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Unauthorized request: Token missing');
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (error) {
    throw new ApiError(HTTP_STATUS.UNAUTHORIZED, error?.message || 'Invalid or expired Access Token');
  }

  // Legacy users may store a city name string in assignedCity; populate would throw a CastError for them
  let user;
  try {
    user = await User.findById(decoded.id).populate('assignedCity', 'name');
  } catch (err) {
    if (err?.name !== 'CastError') throw err;
    user = await User.findById(decoded.id).lean();
  }

  if (!user) {
    throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Invalid Access Token: User not found');
  }

  if (user.status === 'deleted') {
    throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Account is disabled. Contact Super Admin.');
  }

  // Blocked customers / admins are locked out. Blocked or suspended partners may still sign in to see
  // their notice, but every booking feature re-checks status === 'active' and KYC approval.
  if (user.status === 'blocked' && user.role !== ROLES.PARTNER) {
    throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Account is blocked. Contact Super Admin.');
  }

  req.user = user;
  next();
});
