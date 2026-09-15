import rateLimit from 'express-rate-limit';
import { config } from '../config/env.config.js';
import { ApiError } from '../utils/api-error.js';

export const generalRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.isTest || config.isDevelopment,
  handler: (_req, _res, next) => {
    next(ApiError.tooManyRequests('Too many requests from this IP, please try again after 15 minutes.'));
  }
});

export const authRateLimiter = rateLimit({
  windowMs: config.auth.rateLimit.windowMs,
  max: config.auth.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.isTest || config.isDevelopment,
  handler: (_req, _res, next) => {
    next(ApiError.tooManyRequests('Too many authentication attempts. Please try again after 15 minutes.'));
  }
});

export const contactRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.isTest || config.isDevelopment,
  handler: (_req, _res, next) => {
    next(ApiError.tooManyRequests('Too many contact inquiries submitted from this IP. Please try again after 15 minutes.'));
  }
});

export const bookingRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.isTest || config.isDevelopment,
  handler: (_req, _res, next) => {
    next(ApiError.tooManyRequests('Too many booking attempts from this IP. Please try again after 15 minutes.'));
  }
});

export const recommendationRateLimiter = rateLimit({
  windowMs: config.recommendations.rateLimit.windowMs,
  max: config.recommendations.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.isTest,
  handler: (_req, _res, next) => {
    next(ApiError.tooManyRequests('Too many recommendation requests from this IP. Please try again after a few moments.'));
  }
});

export const passwordResetRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.isTest,
  handler: (_req, _res, next) => {
    next(ApiError.tooManyRequests('Too many password reset requests. Please try again after 15 minutes.'));
  }
});

export const reviewRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.isTest,
  handler: (_req, _res, next) => {
    next(ApiError.tooManyRequests('Too many review actions from this IP. Please try again after 15 minutes.'));
  }
});

export const paymentRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.isTest,
  handler: (_req, _res, next) => {
    next(ApiError.tooManyRequests('Too many payment operations from this IP. Please try again after 15 minutes.'));
  }
});

export const adminRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.isTest,
  handler: (_req, _res, next) => {
    next(ApiError.tooManyRequests('Too many administrative requests. Please slow down.'));
  }
});


