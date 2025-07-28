const { supabase } = require('../config/supabaseClient');
const { getUserByAuthId } = require('../utils/getUserByAuthId');
const { verifySupabaseToken, extractToken } = require('../utils/jwtVerify');

// Cache for user data with TTL (5 minutes)
const userCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

exports.isAuthenticatedUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractToken(authHeader);

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: Please Login' });
    }

    // Try to verify token locally first
    const localVerification = await verifySupabaseToken(token);
    
    if (localVerification.error) {
      // If token is expired, inform the client
      if (localVerification.expired) {
        return res.status(401).json({ error: 'Token expired', expired: true });
      }
      
      // If local verification fails for other reasons, fall back to Supabase
      const { data, error } = await supabase.auth.getUser(token);
      
      if (error || !data.user) {
        return res.status(401).json({ error: 'Unauthorized: Please login' });
      }
      
      // Use Supabase response
      const user = await getUserByAuthId(data.user.id);
      
      if (user?.error) {
        return res.status(401).json({ error: 'User does not exist.' });
      }
      
      req.user = {
        ...user,
        auth_id: data.user.id
      };
      
      return next();
    }

    // Local verification succeeded
    const authId = localVerification.user.id;
    
    // Check user cache
    const cacheKey = `user:${authId}`;
    const cachedUser = userCache.get(cacheKey);
    
    if (cachedUser && cachedUser.timestamp > Date.now() - CACHE_TTL) {
      req.user = cachedUser.data;
      return next();
    }

    // Fetch user from database
    const user = await getUserByAuthId(authId);

    if (user?.error) {
      return res.status(401).json({ error: 'User does not exist.' });
    }

    // Cache the user data
    const userData = {
      ...user,
      auth_id: authId
    };
    
    userCache.set(cacheKey, {
      data: userData,
      timestamp: Date.now()
    });

    // Clean old cache entries periodically
    if (userCache.size > 1000) {
      const now = Date.now();
      for (const [key, value] of userCache.entries()) {
        if (value.timestamp < now - CACHE_TTL) {
          userCache.delete(key);
        }
      }
    }

    req.user = userData;
    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
