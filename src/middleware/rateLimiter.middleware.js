import rateLimit from 'express-rate-limit';

/**
 * Utility to extract real client IP address even when behind proxies/load balancers
 */
export const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = forwarded.split(',');
    return ips[0].trim();
  }
  return (
    req.headers['x-real-ip'] ||
    req.headers['cf-connecting-ip'] ||
    req.ip ||
    req.socket?.remoteAddress ||
    '127.0.0.1'
  );
};

/**
 * Strict Rate Limiter for OTP Requests, Login, and Auth endpoints
 * Prevents OTP Bombing, Brute-Force Password Attacks, and Credential Stuffing.
 * Uses keyGenerator with getClientIp so each device/IP is isolated and tracked separately.
 */
/**
 * Per-number OTP rate limit config.
 * Production: max 3 OTPs per 10 minutes per number, 60s cooldown between each.
 * Development: relaxed limits.
 */
const OTP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const OTP_MAX_PER_WINDOW = process.env.NODE_ENV === 'production' ? 3 : 10;
const OTP_COOLDOWN_SEC = process.env.NODE_ENV === 'production' ? 60 : 10;

export const otpAuthRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 10, // Limit each client IP to 10 OTP/Auth attempts per window
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  keyGenerator: (req) => getClientIp(req),
  skipSuccessfulRequests: true, // Successful logins don't burn rate limit slots
  message: {
    statusCode: 429,
    success: false,
    message: 'Too many OTP or Authentication attempts from this device. Please try again after 15 minutes.',
  },
});

export { OTP_WINDOW_MS, OTP_MAX_PER_WINDOW, OTP_COOLDOWN_SEC };
export const generalApiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: process.env.NODE_ENV === 'production' ? 500 : 2000, // Allow high request limit in dev mode
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  message: {
    statusCode: 429,
    success: false,
    message: 'Too many requests from this device. Please wait a moment before trying again.',
  },
});
