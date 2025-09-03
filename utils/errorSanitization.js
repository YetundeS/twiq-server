const logger = require('./logger');

/**
 * Error message sanitization utility
 * Prevents information disclosure through error messages
 */

// Sensitive patterns to remove from error messages
const SENSITIVE_PATTERNS = {
  // Database connection strings
  database: /postgresql:\/\/[^@\s]+@[^\/\s]+\/\w+/gi,
  
  // API keys and tokens
  apiKeys: /sk_[a-z]+_[A-Za-z0-9]+|pk_[a-z]+_[A-Za-z0-9]+/gi,
  tokens: /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]*/gi,
  
  // File paths
  filePaths: /[A-Za-z]:\\[^\\]+\\[^\\]+|\/[^\/]+\/[^\/]+/gi,
  
  // IP addresses (internal)
  privateIPs: /\b(?:10\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|192\.168\.)\d{1,3}\.\d{1,3}\b/gi,
  
  // Email addresses in errors
  emails: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
  
  // Stack trace file paths
  stackPaths: /at [^(]+\([^)]+\)/gi,
  
  // Supabase specific errors
  supabaseErrors: /supabase|postgresql|postgrest/gi
};

// Generic error messages for different error types
const GENERIC_MESSAGES = {
  authentication: 'Authentication failed. Please check your credentials.',
  authorization: 'Access denied. You do not have permission to perform this action.',
  validation: 'The provided data is invalid. Please check your input.',
  database: 'A database error occurred. Please try again later.',
  external_service: 'An external service is temporarily unavailable.',
  file_processing: 'File processing failed. Please try again.',
  rate_limit: 'Too many requests. Please try again later.',
  payment: 'Payment processing failed. Please try again or contact support.',
  system: 'A system error occurred. Please try again later.',
  not_found: 'The requested resource was not found.',
  conflict: 'The operation could not be completed due to a conflict.',
  quota: 'You have exceeded your usage quota.',
  default: 'An error occurred. Please try again later.'
};

/**
 * Classify error type based on error message and context
 */
const classifyError = (error, context = {}) => {
  const message = error.message?.toLowerCase() || '';
  const code = error.code?.toLowerCase() || context.code?.toLowerCase() || '';
  
  // Authentication errors
  if (message.includes('unauthorized') || 
      message.includes('invalid token') || 
      message.includes('jwt') ||
      code === 'unauthorized') {
    return 'authentication';
  }
  
  // Authorization errors
  if (message.includes('forbidden') || 
      message.includes('access denied') ||
      code === 'forbidden') {
    return 'authorization';
  }
  
  // Database errors
  if (message.includes('supabase') || 
      message.includes('postgres') || 
      message.includes('database') ||
      code.startsWith('23')) {
    return 'database';
  }
  
  // Validation errors
  if (message.includes('validation') || 
      message.includes('invalid') || 
      message.includes('required') ||
      code === 'validation_error') {
    return 'validation';
  }
  
  // Stripe/Payment errors
  if (message.includes('stripe') || 
      message.includes('payment') ||
      context.source === 'stripe') {
    return 'payment';
  }
  
  // Rate limiting
  if (message.includes('rate limit') || 
      message.includes('too many') ||
      code === 'rate_limited') {
    return 'rate_limit';
  }
  
  // Quota errors
  if (message.includes('quota') || 
      message.includes('usage limit') ||
      context.source === 'quota') {
    return 'quota';
  }
  
  // File processing
  if (message.includes('file') || 
      message.includes('upload') ||
      context.source === 'file_processing') {
    return 'file_processing';
  }
  
  // Not found errors
  if (message.includes('not found') || 
      code === 'not_found') {
    return 'not_found';
  }
  
  // Conflict errors
  if (message.includes('conflict') || 
      message.includes('already exists') ||
      code === 'conflict') {
    return 'conflict';
  }
  
  return 'default';
};

/**
 * Sanitize error message by removing sensitive information
 */
const sanitizeErrorMessage = (message) => {
  if (!message || typeof message !== 'string') return message;
  
  let sanitized = message;
  
  // Remove sensitive patterns
  Object.entries(SENSITIVE_PATTERNS).forEach(([pattern, regex]) => {
    sanitized = sanitized.replace(regex, `[${pattern.toUpperCase()}_REDACTED]`);
  });
  
  return sanitized;
};

/**
 * Create safe error response for client
 */
const createSafeErrorResponse = (error, context = {}) => {
  const errorType = classifyError(error, context);
  const genericMessage = GENERIC_MESSAGES[errorType];
  
  // Log the actual error internally
  logger.logSystemError('Error occurred', error, {
    errorType,
    endpoint: context.endpoint,
    userId: context.userId,
    ip: context.ip,
    userAgent: context.userAgent,
    originalMessage: error.message
  });
  
  // Return sanitized response
  const response = {
    error: genericMessage,
    code: errorType.toUpperCase(),
    timestamp: new Date().toISOString()
  };
  
  // Add error ID for tracking (but don't expose sensitive details)
  if (context.correlationId) {
    response.correlationId = context.correlationId;
  }
  
  // In development, include more details (but still sanitized)
  if (process.env.NODE_ENV === 'development') {
    response.details = {
      sanitizedMessage: sanitizeErrorMessage(error.message),
      stack: error.stack ? sanitizeErrorMessage(error.stack) : undefined
    };
  }
  
  return response;
};

/**
 * Express error handling middleware
 */
const errorSanitizationMiddleware = (error, req, res, next) => {
  const context = {
    endpoint: req.path,
    method: req.method,
    userId: req.user?.id,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    correlationId: req.headers['x-correlation-id'] || Date.now().toString()
  };
  
  const safeResponse = createSafeErrorResponse(error, context);
  
  // Determine status code
  let statusCode = error.statusCode || error.status || 500;
  
  // Override status code based on error type
  const errorType = classifyError(error, context);
  switch (errorType) {
    case 'authentication':
      statusCode = 401;
      break;
    case 'authorization':
      statusCode = 403;
      break;
    case 'validation':
      statusCode = 400;
      break;
    case 'not_found':
      statusCode = 404;
      break;
    case 'conflict':
      statusCode = 409;
      break;
    case 'rate_limit':
    case 'quota':
      statusCode = 429;
      break;
    case 'external_service':
      statusCode = 503;
      break;
  }
  
  res.status(statusCode).json(safeResponse);
};

/**
 * Wrapper for async route handlers that automatically sanitizes errors
 */
const withErrorSanitization = (handler) => {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      errorSanitizationMiddleware(error, req, res, next);
    }
  };
};

module.exports = {
  sanitizeErrorMessage,
  createSafeErrorResponse,
  errorSanitizationMiddleware,
  withErrorSanitization,
  classifyError,
  GENERIC_MESSAGES
};