const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

// Import the IPv6-safe key generator helper
const { ipKeyGenerator } = require('express-rate-limit');

// Create different rate limiters for different endpoints

// General API rate limiter
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Store in memory (default)
  skipSuccessfulRequests: false,
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise use IPv6-safe IP
    return req.user?.id || ipKeyGenerator(req);
  }
});

// Strict rate limiter for chat messages (per user)
const chatMessageLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // Limit to 10 messages per minute per user
  message: 'Too many messages sent. Please wait before sending more.',
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true, // Don't count failed requests
  keyGenerator: (req) => {
    // Always use user ID for authenticated endpoints
    // Fallback to IPv6-safe IP for anonymous users
    return req.user?.id || ipKeyGenerator(req);
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many messages sent. Please wait before sending more.',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

// File upload rate limiter
const fileUploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // Limit to 20 file uploads per 5 minutes
  message: 'Too many file uploads. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise use IPv6-safe IP
    return req.user?.id || ipKeyGenerator(req);
  }
});

// Auth endpoints rate limiter (stricter for security)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit to 5 auth attempts per 15 minutes
  message: 'Too many authentication attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed attempts
  keyGenerator: (req) => {
    // Use IPv6-safe IP for auth endpoints (security-focused)
    return ipKeyGenerator(req);
  }
});

// Email verification rate limiter
const emailVerificationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // Limit to 3 email verification attempts per 5 minutes
  message: 'Too many email verification attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id || ipKeyGenerator(req);
  }
});

// Password reset rate limiter
const passwordResetLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 3, // Limit to 3 password reset requests per 10 minutes per email
  message: 'Too many password reset requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use email hash as key to prevent enumeration
    const email = req.body?.email || '';
    return email ? `password_reset_${email}` : ipKeyGenerator(req);
  }
});

// Admin endpoints rate limiter (stricter)
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit admin users to 50 requests per 15 minutes
  message: 'Too many admin requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id || ipKeyGenerator(req);
  }
});

// Create custom rate limiter factory for specific endpoints
const createCustomLimiter = (options) => {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    // Default keyGenerator that handles IPv6 properly
    keyGenerator: (req) => {
      return req.user?.id || ipKeyGenerator(req);
    },
    ...options // Allow overriding default options
  });
};

// Alternative approach: Separate IP and User limiters for better control
const createDualLimiter = (ipOptions, userOptions) => {
  const ipLimiter = rateLimit({
    ...ipOptions,
    keyGenerator: ipKeyGenerator, // Always use IP with IPv6 support
  });

  const userLimiter = rateLimit({
    ...userOptions,
    keyGenerator: (req) => req.user?.id || 'anonymous',
    skip: (req) => !req.user?.id, // Skip for unauthenticated users
  });

  // Return middleware that applies both limiters
  return (req, res, next) => {
    ipLimiter(req, res, (err) => {
      if (err) return next(err);
      userLimiter(req, res, next);
    });
  };
};

// Example usage of dual limiter for high-security endpoints
const secureEndpointLimiter = createDualLimiter(
  {
    windowMs: 15 * 60 * 1000,
    max: 1000, // Higher IP limit
    message: 'Too many requests from this IP address'
  },
  {
    windowMs: 15 * 60 * 1000,
    max: 100, // Lower user limit
    message: 'Too many requests from this user account'
  }
);

// Webhook rate limiter (strict for security)
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 50, // Allow up to 50 webhook calls per minute (Stripe can send multiple events)
  message: 'Too many webhook requests. Please check your Stripe configuration.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use IPv6-safe IP for webhooks (no user context)
    return ipKeyGenerator(req);
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Webhook rate limit exceeded',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

// Per-user API quota tracker (for subscription-based limits)
const subscriptionQuotaCheck = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) return next();

    // Check if user has exceeded their subscription quota
    const usage = user.subscription_usage || { input_tokens_used: 0, output_tokens_used: 0 };
    const quota = user.subscription_quota || { input_tokens: 0, output_tokens: 0 };

    // Calculate usage percentage
    const inputUsagePercent = quota.input_tokens > 0 ? (usage.input_tokens_used / quota.input_tokens) * 100 : 0;
    const outputUsagePercent = quota.output_tokens > 0 ? (usage.output_tokens_used / quota.output_tokens) * 100 : 0;

    // Add headers to inform client about quota usage
    res.setHeader('X-Quota-Input-Used', usage.input_tokens_used);
    res.setHeader('X-Quota-Input-Limit', quota.input_tokens);
    res.setHeader('X-Quota-Output-Used', usage.output_tokens_used);
    res.setHeader('X-Quota-Output-Limit', quota.output_tokens);

    // Warn if approaching limits (90% used)
    if (inputUsagePercent > 90 || outputUsagePercent > 90) {
      res.setHeader('X-Quota-Warning', 'Approaching subscription limits');
    }

    // Check if quota exceeded
    if (inputUsagePercent >= 100 || outputUsagePercent >= 100) {
      return res.status(429).json({
        error: 'Subscription quota exceeded',
        usage: {
          input_used: usage.input_tokens_used,
          input_limit: quota.input_tokens,
          output_used: usage.output_tokens_used,
          output_limit: quota.output_tokens
        }
      });
    }

    next();
  } catch (error) {
    // Don't block request on quota check errors
    logger.logSystemError('Quota check error', error, {
      userId: req.user?.id,
      endpoint: req.path
    });
    next();
  }
};

module.exports = {
  generalLimiter,
  chatMessageLimiter,
  fileUploadLimiter,
  authLimiter,
  emailVerificationLimiter,
  passwordResetLimiter,
  adminLimiter,
  webhookLimiter,
  createCustomLimiter,
  createDualLimiter,
  secureEndpointLimiter,
  subscriptionQuotaCheck
};