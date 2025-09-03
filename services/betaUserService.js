const { supabase, supabaseAdmin } = require("../config/supabaseClient");
const { PLAN_QUOTAS } = require("../constants");
const { getRandomAvatar } = require("./authService");
const { v4: uuidv4 } = require("uuid");
const resend = require("../config/resendClient");
const { userInvitationEmail } = require("../emails/templates/userInvitation");
const logger = require('../utils/logger');

async function grantBetaAccess({ 
  userEmail, 
  betaPlan, 
  startDate, 
  durationDays, 
  grantedByAdminId 
}) {
  try {
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + durationDays);

    const quota = PLAN_QUOTAS[betaPlan];
    if (!quota) {
      throw new Error(`Invalid beta plan: ${betaPlan}`);
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({
        is_beta_user: true,
        beta_plan: betaPlan,
        beta_start_date: startDate,
        beta_end_date: endDate,
        beta_granted_by: grantedByAdminId,
        beta_converted: false,
        is_active: true,
        subscription_plan: betaPlan,
        subscription_quota: quota,
        quota_last_reset: new Date()
      })
      .eq('email', userEmail)
      .select()
      .single();

    if (error) throw error;
    
    return { success: true, user: data };
  } catch (error) {
    logger.logSystemError('Error granting beta access', error, { userEmail, betaPlan, grantedByAdminId });
    return { success: false, error: error.message };
  }
}

async function checkBetaStatus(userId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('is_beta_user, beta_plan, beta_start_date, beta_end_date')
      .eq('id', userId)
      .single();

    if (error) throw error;

    if (!data.is_beta_user) {
      return { isActive: false };
    }

    const now = new Date();
    const startDate = new Date(data.beta_start_date);
    const endDate = new Date(data.beta_end_date);

    const isActive = now >= startDate && now <= endDate;

    return {
      isActive,
      plan: data.beta_plan,
      startDate: data.beta_start_date,
      endDate: data.beta_end_date,
      daysRemaining: isActive ? Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)) : 0
    };
  } catch (error) {
    logger.logSystemError('Error checking beta status', error, { userId });
    return { isActive: false };
  }
}

async function getBetaUsers({ includeExpired = false }) {
  try {
    let query = supabase
      .from('profiles')
      .select(`
        id,
        email,
        user_name,
        organization_name,
        is_beta_user,
        beta_plan,
        beta_start_date,
        beta_end_date,
        beta_converted,
        subscription_usage,
        created_at
      `)
      .eq('is_beta_user', true)
      .order('beta_end_date', { ascending: false });

    if (!includeExpired) {
      query = query.gte('beta_end_date', new Date().toISOString());
    }

    const { data, error } = await query;

    if (error) throw error;

    return data.map(user => ({
      ...user,
      isExpired: new Date(user.beta_end_date) < new Date(),
      daysRemaining: Math.max(0, Math.ceil((new Date(user.beta_end_date) - new Date()) / (1000 * 60 * 60 * 24)))
    }));
  } catch (error) {
    logger.logSystemError('Error fetching beta users', error, { includeExpired });
    return [];
  }
}

async function revokeBetaAccess(userId) {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        is_beta_user: false,
        beta_plan: null,
        beta_start_date: null,
        beta_end_date: null,
        beta_granted_by: null,
        is_active: false,
        subscription_plan: null,
        subscription_quota: null
      })
      .eq('id', userId);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    logger.logSystemError('Error revoking beta access', error, { userId });
    return { success: false, error: error.message };
  }
}

async function handleExpiredBetaUsers() {
  try {
    const { data: expiredUsers, error } = await supabase
      .from('profiles')
      .select('id, email, beta_end_date')
      .eq('is_beta_user', true)
      .lt('beta_end_date', new Date().toISOString())
      .eq('beta_converted', false);

    if (error) throw error;

    for (const user of expiredUsers) {
      await supabase
        .from('profiles')
        .update({
          is_active: false,
          subscription_plan: null,
          subscription_quota: null
        })
        .eq('id', user.id);

      logger.logInfo(`Deactivated expired beta user: ${user.email}`, { userId: user.id, email: user.email, beta_end_date: user.beta_end_date });
    }

    return { processedCount: expiredUsers.length };
  } catch (error) {
    logger.logSystemError('Error handling expired beta users', error);
    return { processedCount: 0, error: error.message };
  }
}

async function getBetaExpiringUsers(daysBeforeExpiry) {
  try {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysBeforeExpiry);
    
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, user_name, beta_end_date, beta_plan')
      .eq('is_beta_user', true)
      .eq('beta_converted', false)
      .gte('beta_end_date', startOfDay.toISOString())
      .lte('beta_end_date', endOfDay.toISOString());

    if (error) throw error;

    return data;
  } catch (error) {
    logger.logSystemError('Error fetching expiring beta users', error, { daysBeforeExpiry });
    return [];
  }
}

async function convertBetaToPaid(userId, stripeSubscriptionId) {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        beta_converted: true,
        stripe_subscription_id: stripeSubscriptionId
      })
      .eq('id', userId);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    logger.logSystemError('Error converting beta to paid', error, { userId, stripeSubscriptionId });
    return { success: false, error: error.message };
  }
}

async function inviteAndGrantBetaAccess({
  userName,
  userEmail,
  organizationName,
  betaPlan,
  startDate,
  durationDays,
  grantedByAdminId
}) {
  let authUserId = null; // Track for cleanup if needed
  
  try {
    logger.logInfo('Starting user invitation process', { userEmail, userName, organizationName, betaPlan, grantedByAdminId });
    
    // Generate temporary password
    const temporaryPassword = Math.random().toString(36).slice(-12);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + durationDays);
    
    const quota = PLAN_QUOTAS[betaPlan];
    if (!quota) {
      logger.logSystemError('Invalid beta plan provided', new Error(`Invalid beta plan: ${betaPlan}`), { betaPlan, userEmail });
      throw new Error(`Invalid beta plan: ${betaPlan}`);
    }

    // Check if user already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', userEmail)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      logger.logSystemError('Error checking existing user', checkError, { userEmail });
      throw new Error(`Error checking existing user: ${checkError.message}`);
    }

    if (existingUser) {
      logger.logInfo('User already exists during invitation process', { existingUserId: existingUser.id, userEmail });
      return { 
        success: false, 
        error: "User with this email already exists. Use the grant beta access feature instead." 
      };
    }

    // Start transaction-like operation
    // Note: Supabase doesn't have built-in transactions for cross-service operations,
    // so we'll use careful error handling and cleanup
    
    // Step 1: Create auth user with temporary password
    logger.logInfo('Creating auth user', { userEmail });
    const { data: signupData, error: signupError } = await supabaseAdmin.auth.admin.createUser({
      email: userEmail,
      password: temporaryPassword,
      email_confirm: true // Auto-confirm email since it's an admin invitation
    });

    if (signupError) {
      logger.logSystemError('Failed to create auth user', signupError, { userEmail });
      throw new Error(`Failed to create user: ${signupError.message}`);
    }

    if (!signupData?.user) {
      logger.logSystemError('No user data returned from Supabase', new Error('No user data returned'), { userEmail });
      throw new Error("Failed to create user account");
    }

    authUserId = signupData.user.id; // Store for potential cleanup

    // Step 2: Generate avatar and verification token
    logger.logInfo('Generating avatar for user', { userName, userEmail });
    const { avatar_url } = getRandomAvatar(userName);
    const token = uuidv4();

    // Step 3: Create user profile with beta access
    logger.logInfo('Creating user profile in database', { userEmail, authUserId, betaPlan });
    const profilePayload = {
      auth_id: signupData.user.id,
      user_name: userName,
      email: userEmail,
      avatar_url,
      organization_name: organizationName,
      email_verification_token: token,
      email_confirmed: true, // Auto-confirmed since admin invited
      is_beta_user: true,
      beta_plan: betaPlan,
      beta_start_date: startDate,
      beta_end_date: endDate,
      beta_granted_by: grantedByAdminId,
      beta_converted: false,
      is_active: true,
      subscription_plan: betaPlan,
      subscription_quota: quota,
      quota_last_reset: new Date()
    };
    
    // Use database transaction for profile creation
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .insert(profilePayload)
      .select()
      .single();

    if (profileError) {
      logger.logSystemError('Failed to create user profile', profileError, { userEmail, authUserId, betaPlan });
      
      // Cleanup: delete auth user if profile creation fails
      if (authUserId) {
        logger.logInfo('Rolling back: Deleting auth user', { authUserId, userEmail });
        try {
          await supabaseAdmin.auth.admin.deleteUser(authUserId);
          logger.logInfo('Auth user deleted successfully during rollback', { authUserId, userEmail });
        } catch (cleanupError) {
          logger.logSystemError('Warning: Failed to delete auth user during cleanup', cleanupError, { authUserId, userEmail });
          // Log this for manual cleanup if needed
        }
      }
      
      throw new Error(`Failed to create user profile: ${profileError.message}`);
    }

    // Verify both records exist before proceeding
    const { data: verifyProfile, error: verifyError } = await supabase
      .from('profiles')
      .select('id, auth_id, email')
      .eq('auth_id', authUserId)
      .single();

    if (verifyError || !verifyProfile) {
      logger.logSystemError('Profile verification failed after creation', verifyError || new Error('Verification failed'), { authUserId, userEmail });
      
      // Cleanup both if verification fails
      if (authUserId) {
        logger.logInfo('Rolling back: Deleting auth user due to verification failure', { authUserId, userEmail });
        try {
          await supabaseAdmin.auth.admin.deleteUser(authUserId);
        } catch (cleanupError) {
          logger.logSystemError('Warning: Failed to delete auth user during verification cleanup', cleanupError, { authUserId, userEmail });
        }
      }
      
      throw new Error('Failed to verify user creation');
    }

    logger.logInfo('User profile created and verified successfully', { profileId: profileData.id, userEmail, authUserId, betaPlan });

    // Send invitation email
    const loginUrl = "https://app.twiq.ai/auth";
    const { subject, html } = userInvitationEmail({
      userName,
      userEmail,
      temporaryPassword,
      betaPlan,
      endDate,
      loginUrl
    });

    try {
      await resend.emails.send({
        from: "Team TWIQ <team@mail.twiq.ai>",
        to: userEmail,
        subject,
        html
      });
      logger.logInfo('Invitation email sent successfully', { userEmail, betaPlan });
    } catch (emailError) {
      logger.logSystemError('Failed to send invitation email', emailError, { userEmail, betaPlan });
      // Don't fail the entire operation if email fails
      // The user was created successfully, just log the email error
    }

    logger.logInfo('User invitation process completed successfully', { userEmail, userName, betaPlan, profileId: profileData.id });
    
    return { 
      success: true, 
      user: profileData,
      temporaryPassword // Return for admin reference (consider security implications)
    };
  } catch (error) {
    logger.logSystemError('Error in inviteAndGrantBetaAccess', error, { userEmail, userName, betaPlan, authUserId });
    return { success: false, error: error.message };
  }
}

module.exports = {
  grantBetaAccess,
  checkBetaStatus,
  getBetaUsers,
  revokeBetaAccess,
  handleExpiredBetaUsers,
  getBetaExpiringUsers,
  convertBetaToPaid,
  inviteAndGrantBetaAccess
};