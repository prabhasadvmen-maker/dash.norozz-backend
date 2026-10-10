import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

/**
 * Global Centralized Express Error Handling Middleware
 */
export const errorHandler = (err, req, res, next) => {
  let error = err;

  if (!(error instanceof ApiError)) {
    if (error.name === 'CastError') {
      const message = `Invalid value for ${error.path}: ${error.value}`;
      error = new ApiError(HTTP_STATUS.BAD_REQUEST, message);
    } else if (error.name === 'ValidationError') {
      const message = Object.values(error.errors).map(val => val.message).join(', ');
      error = new ApiError(HTTP_STATUS.BAD_REQUEST, message);
    } else {
      const statusCode = error.statusCode || (error instanceof SyntaxError ? HTTP_STATUS.BAD_REQUEST : HTTP_STATUS.INTERNAL_SERVER_ERROR);
      const message = error.message || 'Internal Server Error';
      error = new ApiError(statusCode, message, error?.errors || [], err.stack);
    }
  }

  const response = {
    statusCode: error.statusCode,
    success: false,
    message: error.message,
    errors: error.errors?.length ? error.errors : undefined,
  };

  // Ensure CORS header is attached even on unhandled error responses
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  return res.status(error.statusCode).json(response);
};
