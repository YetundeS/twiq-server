const crypto = require('crypto');

// In-memory cache for pending requests
const pendingRequests = new Map();
const CACHE_TTL = 30000; // 30 seconds

/**
 * Generate a unique key for the request based on user, endpoint, and body
 * @param {Object} req - Express request object
 * @returns {string} - Request signature
 */
const generateRequestSignature = (req) => {
  const userId = req.user?.id || 'anonymous';
  const method = req.method;
  const path = req.path;
  const body = req.body ? JSON.stringify(req.body) : '';
  
  // Create a hash of the request details
  const signature = crypto
    .createHash('sha256')
    .update(`${userId}:${method}:${path}:${body}`)
    .digest('hex');
    
  return signature;
};

/**
 * Middleware to deduplicate concurrent identical requests
 * Particularly useful for preventing duplicate message sends or expensive operations
 */
const deduplicationMiddleware = (options = {}) => {
  const {
    ttl = CACHE_TTL,
    skipRoutes = [],
    onDuplicate = null
  } = options;

  return async (req, res, next) => {
    // Skip deduplication for certain routes or methods
    if (skipRoutes.includes(req.path) || req.method === 'GET') {
      return next();
    }

    const requestSignature = generateRequestSignature(req);
    
    // Check if an identical request is already being processed
    const existingRequest = pendingRequests.get(requestSignature);
    
    if (existingRequest && existingRequest.timestamp > Date.now() - ttl) {
      // Request is still pending
      if (existingRequest.promise) {
        try {
          // Wait for the original request to complete
          const result = await existingRequest.promise;
          
          // Send the same response to the duplicate request
          if (result.statusCode) {
            res.status(result.statusCode);
          }
          
          if (result.headers) {
            Object.entries(result.headers).forEach(([key, value]) => {
              res.setHeader(key, value);
            });
          }
          
          // Add header to indicate this was a deduplicated response
          res.setHeader('X-Deduplicated', 'true');
          res.setHeader('X-Original-Request-Id', existingRequest.id);
          
          if (result.body) {
            return res.json(result.body);
          } else {
            return res.end();
          }
        } catch (error) {
          // If the original request failed, let this one proceed
          pendingRequests.delete(requestSignature);
        }
      }
    }

    // No pending request, proceed with this one
    const requestId = crypto.randomBytes(16).toString('hex');
    let responseData = null;

    // Store a promise that resolves when the request completes
    const requestPromise = new Promise((resolve, reject) => {
      // Override res.json to capture the response
      const originalJson = res.json.bind(res);
      res.json = function(body) {
        responseData = {
          statusCode: res.statusCode,
          headers: res.getHeaders(),
          body: body
        };
        resolve(responseData);
        return originalJson(body);
      };

      // Override res.send for non-JSON responses
      const originalSend = res.send.bind(res);
      res.send = function(body) {
        responseData = {
          statusCode: res.statusCode,
          headers: res.getHeaders(),
          body: body
        };
        resolve(responseData);
        return originalSend(body);
      };

      // Override res.end for empty responses
      const originalEnd = res.end.bind(res);
      res.end = function(...args) {
        if (!responseData) {
          responseData = {
            statusCode: res.statusCode,
            headers: res.getHeaders()
          };
          resolve(responseData);
        }
        return originalEnd(...args);
      };

      // Handle errors
      const originalNext = next;
      next = function(error) {
        if (error) {
          pendingRequests.delete(requestSignature);
          reject(error);
        }
        return originalNext(error);
      };
    });

    // Store the pending request
    pendingRequests.set(requestSignature, {
      id: requestId,
      timestamp: Date.now(),
      promise: requestPromise
    });

    // Clean up after request completes
    res.on('finish', () => {
      setTimeout(() => {
        pendingRequests.delete(requestSignature);
      }, 1000); // Keep in cache for 1 second after completion
    });

    // Add request ID to headers
    res.setHeader('X-Request-Id', requestId);

    // Clean up old entries periodically
    if (Math.random() < 0.01) { // 1% chance to clean up
      const now = Date.now();
      for (const [key, value] of pendingRequests.entries()) {
        if (value.timestamp < now - ttl) {
          pendingRequests.delete(key);
        }
      }
    }

    // Call custom handler if duplicate was detected but request proceeded
    if (existingRequest && onDuplicate) {
      onDuplicate(req, existingRequest);
    }

    next();
  };
};

/**
 * Clear all pending requests (useful for testing)
 */
const clearPendingRequests = () => {
  pendingRequests.clear();
};

module.exports = {
  deduplicationMiddleware,
  generateRequestSignature,
  clearPendingRequests
};