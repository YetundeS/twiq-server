const logger = require('../utils/logger');

/**
 * Input sanitization and validation middleware
 * Protects against XSS, injection attacks, and malformed data
 */

// Security patterns to detect potential attacks
const SECURITY_PATTERNS = {
  xss: /<script[\s\S]*?>[\s\S]*?<\/script>|<iframe[\s\S]*?>|<object[\s\S]*?>|javascript:/gi,
  sql: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/gi,
  path: /\.\.[\/\\]|[\/\\]etc[\/\\]|[\/\\]var[\/\\]|[\/\\]tmp[\/\\]/gi,
  command: /(\||&|;|`|\$\(|\${)/g,
  html: /<[^>]*>/g
};

// Maximum lengths for different field types
const FIELD_LIMITS = {
  email: 254,
  password: 128,
  name: 100,
  organization: 100,
  message: 10000,
  title: 200,
  description: 1000,
  default: 500
};

/**
 * Sanitize a string by removing/escaping dangerous characters
 */
const sanitizeString = (value, options = {}) => {
  if (typeof value !== 'string') return value;
  
  const { 
    allowHtml = false, 
    maxLength = FIELD_LIMITS.default,
    trimWhitespace = true 
  } = options;
  
  let sanitized = value;
  
  // Trim whitespace if requested
  if (trimWhitespace) {
    sanitized = sanitized.trim();
  }
  
  // Check length limits
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  // Remove HTML tags unless explicitly allowed
  if (!allowHtml && SECURITY_PATTERNS.html.test(sanitized)) {
    sanitized = sanitized.replace(SECURITY_PATTERNS.html, '');
  }
  
  // Remove dangerous XSS patterns
  if (SECURITY_PATTERNS.xss.test(sanitized)) {
    sanitized = sanitized.replace(SECURITY_PATTERNS.xss, '');
  }
  
  // Remove SQL injection patterns
  if (SECURITY_PATTERNS.sql.test(sanitized)) {
    sanitized = sanitized.replace(SECURITY_PATTERNS.sql, '');
  }
  
  // Remove path traversal patterns
  if (SECURITY_PATTERNS.path.test(sanitized)) {
    sanitized = sanitized.replace(SECURITY_PATTERNS.path, '');
  }
  
  // Remove command injection patterns
  if (SECURITY_PATTERNS.command.test(sanitized)) {
    sanitized = sanitized.replace(SECURITY_PATTERNS.command, '');
  }
  
  return sanitized;
};

/**
 * Detect if input contains potentially malicious content
 */
const detectMaliciousContent = (value) => {
  if (typeof value !== 'string') return false;
  
  const threats = [];
  
  if (SECURITY_PATTERNS.xss.test(value)) threats.push('XSS');
  if (SECURITY_PATTERNS.sql.test(value)) threats.push('SQL_INJECTION');
  if (SECURITY_PATTERNS.path.test(value)) threats.push('PATH_TRAVERSAL');
  if (SECURITY_PATTERNS.command.test(value)) threats.push('COMMAND_INJECTION');
  
  return threats.length > 0 ? threats : false;
};

/**
 * Recursively sanitize an object
 */
const sanitizeObject = (obj, options = {}) => {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sanitized = Array.isArray(obj) ? [] : {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      // Apply field-specific limits
      const fieldOptions = {
        ...options,
        maxLength: FIELD_LIMITS[key] || FIELD_LIMITS.default
      };
      
      sanitized[key] = sanitizeString(value, fieldOptions);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value, options);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

/**
 * Main sanitization middleware
 */
const inputSanitization = (options = {}) => {
  return (req, res, next) => {
    try {
      const { 
        logThreats = true, 
        blockThreats = true,
        sanitizeBody = true,
        sanitizeQuery = true,
        sanitizeParams = true
      } = options;
      
      // Track any threats found
      const threatsFound = [];
      
      // Sanitize request body
      if (sanitizeBody && req.body) {
        for (const [key, value] of Object.entries(req.body)) {
          if (typeof value === 'string') {
            const threats = detectMaliciousContent(value);
            if (threats) {
              threatsFound.push({ field: `body.${key}`, threats, value: value.substring(0, 100) });
            }
          }
        }
        
        req.body = sanitizeObject(req.body, options);
      }
      
      // Sanitize query parameters
      if (sanitizeQuery && req.query) {
        for (const [key, value] of Object.entries(req.query)) {
          if (typeof value === 'string') {
            const threats = detectMaliciousContent(value);
            if (threats) {
              threatsFound.push({ field: `query.${key}`, threats, value: value.substring(0, 100) });
            }
          }
        }
        
        req.query = sanitizeObject(req.query, options);
      }
      
      // Sanitize URL parameters
      if (sanitizeParams && req.params) {
        for (const [key, value] of Object.entries(req.params)) {
          if (typeof value === 'string') {
            const threats = detectMaliciousContent(value);
            if (threats) {
              threatsFound.push({ field: `params.${key}`, threats, value: value.substring(0, 100) });
            }
          }
        }
        
        req.params = sanitizeObject(req.params, options);
      }
      
      // Handle threats
      if (threatsFound.length > 0) {
        if (logThreats) {
          logger.logSystemError('Malicious input detected', new Error('Security threat'), {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            userId: req.user?.id,
            endpoint: req.path,
            method: req.method,
            threats: threatsFound
          });
        }
        
        if (blockThreats) {
          return res.status(400).json({
            error: 'Invalid input detected',
            code: 'SECURITY_VIOLATION'
          });
        }
      }
      
      next();
    } catch (error) {
      logger.logSystemError('Input sanitization middleware error', error, {
        ip: req.ip,
        endpoint: req.path
      });
      
      // Don't block request on sanitization errors, just log
      next();
    }
  };
};

// Pre-configured middleware for different use cases
const strictSanitization = inputSanitization({
  blockThreats: true,
  logThreats: true,
  allowHtml: false
});

const permissiveSanitization = inputSanitization({
  blockThreats: false,
  logThreats: true,
  allowHtml: true // For content that might contain formatting
});

const authSanitization = inputSanitization({
  blockThreats: true,
  logThreats: true,
  allowHtml: false,
  maxLength: 128 // Strict limits for auth endpoints
});

module.exports = {
  inputSanitization,
  strictSanitization,
  permissiveSanitization,
  authSanitization,
  sanitizeString,
  sanitizeObject,
  detectMaliciousContent
};