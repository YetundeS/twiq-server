const { supabase } = require("../config/supabaseClient");
const { PLAN_QUOTAS } = require("../constants");
const logger = require('../utils/logger');

// In-memory cache for quota checks with 5-minute TTL
const quotaCheckCache = new Map();
const QUOTA_CHECK_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Check if quota should be reset based on last reset time and plan
 * @param {Date} lastReset - Last reset timestamp
 * @param {string} plan - User's subscription plan
 * @returns {boolean} - Whether quota should be reset
 */
function shouldResetQuota(lastReset, plan) {
  if (!lastReset) return true; // Never reset before
  
  const now = new Date();
  const lastResetDate = new Date(lastReset);
  const hoursSinceReset = (now - lastResetDate) / (1000 * 60 * 60);
  
  // Reset daily (every 24 hours) for all plans
  // Can be customized per plan if needed
  const resetPeriodHours = {
    'STARTER': 24,
    'PRO': 24,
    'ENTERPRISE': 24
  };
  
  const period = resetPeriodHours[plan] || 24;
  return hoursSinceReset >= period;
}

/**
 * Reset user's quota in the database
 * @param {string} userId - User ID
 * @param {string} plan - User's subscription plan
 * @returns {Object} - Result of the database update
 */
async function resetUserQuota(userId, plan) {
  try {
    const quota = PLAN_QUOTAS[plan];
    if (!quota) {
      logger.logSystemError('Invalid plan for quota reset', new Error(`Invalid plan: ${plan}`), { plan, userId });
      return { error: `Invalid plan: ${plan}` };
    }
    
    const { data, error } = await supabase
      .from('profiles')
      .update({
        subscription_quota: quota,
        subscription_usage: {
          input_tokens_used: 0,
          output_tokens_used: 0,
          cached_input_tokens_used: 0
        },
        quota_last_reset: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single();
    
    if (error) {
      logger.logSystemError('Error resetting user quota', error, { userId, plan });
      return { error: error.message };
    }
    
    logger.logInfo(`Quota reset for user ${userId} with plan ${plan}`, { userId, plan, quota });
    return { success: true, data };
  } catch (err) {
    logger.logSystemError('Unexpected error in resetUserQuota', err, { userId, plan });
    return { error: err.message };
  }
}

/**
 * Check if quota check is needed based on cache TTL
 * @param {string} userId - User ID
 * @returns {boolean} - Whether quota check is needed
 */
function needsQuotaCheck(userId) {
  const cachedCheck = quotaCheckCache.get(userId);
  if (!cachedCheck) return true;
  
  const now = Date.now();
  return (now - cachedCheck.timestamp) > QUOTA_CHECK_TTL;
}

/**
 * Update quota check cache
 * @param {string} userId - User ID
 * @param {Object} user - User object
 */
function updateQuotaCache(userId, user) {
  quotaCheckCache.set(userId, {
    timestamp: Date.now(),
    user: { ...user }
  });
}

/**
 * Check and reset quota if needed (with caching)
 * @param {Object} user - User object with quota information
 * @returns {Object} - Updated user object or original if no reset needed
 */
async function checkAndResetQuota(user) {
  try {
    // Only process beta users or active subscribers
    if (!user.is_active && !user.is_beta_user) {
      return user;
    }
    
    // Check if we need to perform quota check (5-minute throttling)
    if (!needsQuotaCheck(user.id)) {
      const cachedData = quotaCheckCache.get(user.id);
      return cachedData.user;
    }
    
    // Determine the plan to use (beta plan takes precedence)
    const activePlan = user.is_beta_user ? user.beta_plan : user.subscription_plan;
    
    if (!activePlan) {
      updateQuotaCache(user.id, user);
      return user;
    }
    
    // Check if reset is needed
    if (shouldResetQuota(user.quota_last_reset, activePlan)) {
      const result = await resetUserQuota(user.id, activePlan);
      
      if (result.success && result.data) {
        // Update user object with reset quota
        const updatedUser = {
          ...user,
          subscription_quota: result.data.subscription_quota,
          subscription_usage: result.data.subscription_usage,
          quota_last_reset: result.data.quota_last_reset
        };
        updateQuotaCache(user.id, updatedUser);
        return updatedUser;
      }
    }
    
    updateQuotaCache(user.id, user);
    return user;
  } catch (error) {
    logger.logSystemError('Error in checkAndResetQuota', error, { userId: user.id });
    return user; // Return original user on error
  }
}

/**
 * Get quota info without performing reset check (lightweight)
 * @param {Object} user - User object
 * @returns {Object} - User with current quota info
 */
function getQuotaInfo(user) {
  // Just return user data without quota reset logic
  return user;
}

/**
 * Get remaining quota for a user
 * @param {Object} user - User object
 * @returns {Object} - Remaining quota amounts
 */
function getRemainingQuota(user) {
  const quota = user.subscription_quota || { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 };
  const usage = user.subscription_usage || { input_tokens_used: 0, cached_input_tokens_used: 0, output_tokens_used: 0 };
  
  return {
    input_tokens: Math.max(0, quota.input_tokens - usage.input_tokens_used),
    cached_input_tokens: Math.max(0, quota.cached_input_tokens - usage.cached_input_tokens_used),
    output_tokens: Math.max(0, quota.output_tokens - usage.output_tokens_used)
  };
}

module.exports = {
  shouldResetQuota,
  resetUserQuota,
  checkAndResetQuota,
  getQuotaInfo,
  getRemainingQuota
};