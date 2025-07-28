const rateLimit = require('express-rate-limit');

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
    // Use user ID if authenticated, otherwise use IP
    return req.user?.id || req.ip;
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
    return req.user?.id || 'anonymous';
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
    return req.user?.id || req.ip;
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
    // Use IP for auth endpoints
    return req.ip;
  }
});

// Create custom rate limiter factory for specific endpoints
const createCustomLimiter = (options) => {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    ...options
  });
};

// Per-user API quota tracker (for subscription-based limits)
const subscriptionQuotaCheck = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) return next();

    // Check if user has exceeded their subscription quota
    const usage = user.subscription_usage || { input_tokens_used: 0, output_tokens_used: 0 };
    const quota = user.subscription_quota || { input_tokens: 0, output_tokens: 0 };

    // Calculate usage percentage
    const inputUsagePercent = (usage.input_tokens_used / quota.input_tokens) * 100;
    const outputUsagePercent = (usage.output_tokens_used / quota.output_tokens) * 100;

    // Add headers to inform client about quota usage
    res.setHeader('X-Quota-Input-Used', usage.input_tokens_used);
    res.setHeader('X-Quota-Input-Limit', quota.input_tokens);
    res.setHeader('X-Quota-Output-Used', usage.output_tokens_used);
    res.setHeader('X-Quota-Output-Limit', quota.output_tokens);

    // Warn if approaching limits (90% used)
    if (inputUsagePercent > 90 || outputUsagePercent > 90) {
      res.setHeader('X-Quota-Warning', 'Approaching subscription limits');
    }

    next();
  } catch (error) {
    // Don't block request on quota check errors
    console.error('Quota check error:', error);
    next();
  }
};

module.exports = {
  generalLimiter,
  chatMessageLimiter,
  fileUploadLimiter,
  authLimiter,
  createCustomLimiter,
  subscriptionQuotaCheck
};