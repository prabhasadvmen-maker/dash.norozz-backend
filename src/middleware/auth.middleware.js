import { verifyAccessToken } from '../helpers/jwt.helper.js';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { userRepository } from '../repositories/user.repository.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Verify JWT Access Token in Authorization header or Cookies
 */
export const verifyJWT = asyncHandler(async (req, res, next) => {
  const token =
    req.cookies?.accessToken ||
    req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Unauthorized request: Token missing');
  }

  try {
    const decoded = verifyAccessToken(token);
    const user = await userRepository.findById(decoded.id);

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
