const { supabase } = require("../config/supabaseClient"); // Ensure you import Supabase
const { checkBetaStatus } = require("../services/betaUserService");
const { getQuotaInfo } = require("../services/quotaResetService");
const logger = require('../utils/logger');

const getUserByAuthId = async (auth_id) => {
    if (!auth_id) {
        return { error: "Auth ID is required." };
    }

    try {
        const { data, error } = await supabase
            .from("profiles")
            .select(`
              id, user_name, email, avatar_url, organization_name, 
              subscription_plan, subscription_quota, subscription_usage, 
              is_active, is_admin, stripe_customer_id, email_confirmed,
              created_at, cached_tokens, is_beta_user, beta_plan
            `)
            .eq("auth_id", auth_id) // Assuming `id` is the `auth_id` in the profiles table
            .single(); // Fetch a single user

        if (error) {
            return { error: error.message };
        }

        let userData = data;

        // Check beta status if user is a beta user
        if (userData.is_beta_user) {
            const betaStatus = await checkBetaStatus(userData.id);
            
            // If beta is active, override subscription plan and is_active
            if (betaStatus.isActive) {
                userData.subscription_plan = userData.beta_plan;
                userData.is_active = true;
                userData.beta_days_remaining = betaStatus.daysRemaining;
            } else {
                // Beta expired, ensure beta plan is not used
                userData.is_beta_user = false;
                userData.beta_plan = null;
            }
        }

        // Get current quota info without performing reset check (for both beta and regular users)
        userData = getQuotaInfo(userData);

        return userData;
    } catch (err) {
        logger.logSystemError('Error fetching user by auth ID', err, { auth_id });
        return { error: "Internal server error." };
    }
};

module.exports = { getUserByAuthId };


const validateForm = (formData) => {
    let validationError = "";
    if (!formData.user_name) validationError = "Username is required";
    if (!formData.organization_name) validationError = "The name of your organization is required";
    if (!formData.email) {
      validationError = "Email is required";
    }
    if (!formData.password) {
      validationError = "Password is required";
    } else if (formData.password.length < 6) {
      validationError = "Password must be at least 6 characters";
    }
    return validationError;
  };

module.exports = { getUserByAuthId, validateForm };