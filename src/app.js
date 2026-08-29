import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.js';
import v1Routes from './routes/index.js';
import { errorHandler } from './middleware/error.middleware.js';
import { ApiError } from './utils/ApiError.js';
import { HTTP_STATUS } from './constants/httpStatus.js';

import { generalApiRateLimiter } from './middleware/rateLimiter.middleware.js';
import { sanitizeInput } from './middleware/sanitize.middleware.js';

const app = express();

// Trust reverse proxy (Nginx, AWS, Cloudflare, Heroku) to correctly track client IP
app.set('trust proxy', 1);

// 1. CORS Middleware (Must be FIRST before rate limiters & security headers to handle OPTIONS preflight)
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'https://norozz.in',
  'https://www.norozz.in',
  'https://api.norozz.in',
  process.env.CORS_ORIGIN,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, curl) or allowed origins
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    maxAge: 86400, // Cache preflight OPTIONS responses for 24 hours
  })
);

// Enable Pre-Flight CORS response for all routes
app.options('*', cors());

// Security Middlewares & Rate Limiting (Allow cross-origin resource policy for media/images)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(generalApiRateLimiter);

// Logging Middleware
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Request Parsers & Sanitizer
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(sanitizeInput);
app.use(cookieParser());
app.use(express.static('public'));

// Swagger API Documentation Endpoint
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// API v1 Master Router
app.use('/api', v1Routes);

// Catch 404 Route Not Found
app.use('*', (req, res, next) => {
  next(new ApiError(HTTP_STATUS.NOT_FOUND, `Cannot find ${req.originalUrl} on this server`));
});

// Centralized Global Error Handler
app.use(errorHandler);

export default app;
