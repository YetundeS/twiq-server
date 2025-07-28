const jwt = require('jsonwebtoken');

// Cache for JWT secret (fetched once from Supabase)
let jwtSecret = null;

/**
 * Get JWT secret from environment or Supabase config
 */
const getJwtSecret = () => {
  if (jwtSecret) return jwtSecret;
  
  // Supabase uses the JWT secret from environment variables
  jwtSecret = process.env.SUPABASE_JWT_SECRET || process.env.SUPABASE_ANON_KEY;
  
  if (!jwtSecret) {
    throw new Error('JWT secret not configured');
  }
  
  return jwtSecret;
};

/**
 * Verify a Supabase JWT token locally
 * @param {string} token - The JWT token to verify
 * @returns {object} - Decoded token payload or null if invalid
 */
const verifySupabaseToken = async (token) => {
  try {
    const secret = getJwtSecret();
    
    // Verify and decode the token
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'], // Supabase uses HS256
      issuer: process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin + '/auth/v1' : undefined
    });
    
    // Check token expiration
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < now) {
      return { error: 'Token expired', expired: true };
    }
    
    // Extract user info from token
    return {
      user: {
        id: decoded.sub, // Subject is the user ID
        email: decoded.email,
        role: decoded.role,
        app_metadata: decoded.app_metadata,
        user_metadata: decoded.user_metadata
      },
      session_id: decoded.session_id,
      exp: decoded.exp,
      iat: decoded.iat
    };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return { error: 'Token expired', expired: true };
    }
    if (error.name === 'JsonWebTokenError') {
      return { error: 'Invalid token', invalid: true };
    }
    return { error: error.message };
  }
};

/**
 * Extract token from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} - Extracted token or null
 */
const extractToken = (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.split(' ')[1];
};

module.exports = {
  verifySupabaseToken,
  extractToken,
  getJwtSecret
};