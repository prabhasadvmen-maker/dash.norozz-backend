import { verifyAccessToken } from '../helpers/jwt.helper.js';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
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

  try {
    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.id).populate('assignedCity', 'name');

    if (!user) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Invalid Access Token: User not found');
    }

    if (user.status === 'disabled') {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Account is disabled. Contact Super Admin.');
    }

    req.user = user;
    next();
  } catch (error) {
    throw new ApiError(HTTP_STATUS.UNAUTHORIZED, error?.message || 'Invalid or expired Access Token');
  }
});
