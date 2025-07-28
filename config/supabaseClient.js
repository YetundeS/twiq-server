const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

// Singleton instances with optimized configuration
let supabaseInstance = null;
let supabaseAdminInstance = null;

// Create Supabase client with connection pooling and optimizations
const createOptimizedClient = (key, isAdmin = false) => {
  const options = {
    auth: {
      persistSession: false, // Don't persist sessions on server
      autoRefreshToken: false, // No auto-refresh on server
      detectSessionInUrl: false // Not needed on server
    },
    db: {
      schema: 'public'
    },
    global: {
      // Connection pooling configuration
      fetch: (...args) => fetch(...args, {
        // Keep connections alive for reuse
        keepalive: true,
        // Set reasonable timeout
        signal: AbortSignal.timeout(30000) // 30 second timeout
      }),
      headers: {
        'x-connection-pool': 'true'
      }
    },
    // Retry configuration
    retry: {
      retries: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
      retryOn: [500, 502, 503, 504]
    }
  };

  return createClient(process.env.SUPABASE_URL, key, options);
};

// Get or create Supabase client instance
const getSupabase = () => {
  if (!supabaseInstance) {
    supabaseInstance = createOptimizedClient(process.env.SUPABASE_KEY);
  }
  return supabaseInstance;
};

// Get or create Supabase admin instance
const getSupabaseAdmin = () => {
  if (!supabaseAdminInstance) {
    supabaseAdminInstance = createOptimizedClient(process.env.SUPABASE_SERVICE_ROLE_KEY, true);
  }
  return supabaseAdminInstance;
};

// Export singleton instances
const supabase = getSupabase();
const supabaseAdmin = getSupabaseAdmin();

module.exports = { supabase, supabaseAdmin };
