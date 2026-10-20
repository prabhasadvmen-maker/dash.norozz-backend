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

  // Never leak internals of unexpected (5xx) errors to API clients in production
  const isServerError = error.statusCode >= 500;
  if (isServerError) console.error('Unhandled server error:', err?.stack || err);

  const response = {
    statusCode: error.statusCode,
    success: false,
    message: isServerError && process.env.NODE_ENV === 'production' ? 'Something went wrong. Please try again.' : error.message,
    errors: error.errors?.length ? error.errors : undefined,
  };

  return res.status(error.statusCode).json(response);
};
