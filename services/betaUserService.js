const { supabase, supabaseAdmin } = require("../config/supabaseClient");
const { PLAN_QUOTAS } = require("../constants");
const { getRandomAvatar } = require("./authService");
const { v4: uuidv4 } = require("uuid");
const resend = require("../config/resendClient");
const { userInvitationEmail } = require("../emails/templates/userInvitation");

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
    console.error('Error granting beta access:', error);
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
    console.error('Error checking beta status:', error);
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
    console.error('Error fetching beta users:', error);
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
    console.error('Error revoking beta access:', error);
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

      console.log(`Deactivated expired beta user: ${user.email}`);
    }

    return { processedCount: expiredUsers.length };
  } catch (error) {
    console.error('Error handling expired beta users:', error);
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
    console.error('Error fetching expiring beta users:', error);
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
    console.error('Error converting beta to paid:', error);
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
  try {
    console.log(`🚀 Starting user invitation process for: ${userEmail}`);
    // console.log(`📋 Details: Name=${userName}, Plan=${betaPlan}, Duration=${durationDays} days`);
    
    // Generate temporary password
    const temporaryPassword = Math.random().toString(36).slice(-12);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + durationDays);
    
    // console.log(`🔑 Generated temporary password: ${temporaryPassword}`);
    // console.log(`📅 Trial period: ${startDate} to ${endDate}`);
    
    const quota = PLAN_QUOTAS[betaPlan];
    if (!quota) {
      console.log(`❌ Invalid beta plan: ${betaPlan}`);
      throw new Error(`Invalid beta plan: ${betaPlan}`);
    }
    // console.log(`📊 Plan quota: ${JSON.stringify(quota)}`);

    // Check if user already exists
    // console.log(`🔍 Checking if user exists: ${userEmail}`);
    const { data: existingUser, error: checkError } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', userEmail)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.log(`❌ Error checking existing user:`, checkError);
      throw new Error(`Error checking existing user: ${checkError.message}`);
    }

    if (existingUser) {
      console.log(`❌ User already exists: ${existingUser.id}`);
      return { 
        success: false, 
        error: "User with this email already exists. Use the grant beta access feature instead." 
      };
    }

    // console.log(`✅ User doesn't exist, proceeding with creation`);

    // Create auth user with temporary password
    // console.log(`👤 Creating auth user with Supabase Admin API...`);
    const { data: signupData, error: signupError } = await supabaseAdmin.auth.admin.createUser({
      email: userEmail,
      password: temporaryPassword,
      email_confirm: true // Auto-confirm email since it's an admin invitation
    });

    if (signupError) {
      console.log(`❌ Failed to create auth user:`, signupError);
      throw new Error(`Failed to create user: ${signupError.message}`);
    }

    if (!signupData?.user) {
      console.log(`❌ No user data returned from Supabase`);
      throw new Error("Failed to create user account");
    }

    // console.log(`✅ Auth user created successfully: ${signupData.user.id}`);

    // Generate avatar and verification token
    console.log(`🎭 Generating avatar for: ${userName}`);
    const { avatar_url } = getRandomAvatar(userName);
    const token = uuidv4();
    // console.log(`🎭 Avatar URL: ${avatar_url}, Token: ${token}`);

    // Create user profile with beta access
    // console.log(`🗃️ Creating user profile in database...`);
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
    // console.log(`🗃️ Profile payload:`, JSON.stringify(profilePayload, null, 2));
    
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .insert(profilePayload)
      .select()
      .single();

    if (profileError) {
      console.log(`❌ Failed to create user profile:`, profileError);
      // Cleanup: delete auth user if profile creation fails
      console.log(`🧹 Cleaning up auth user: ${signupData.user.id}`);
      await supabaseAdmin.auth.admin.deleteUser(signupData.user.id);
      throw new Error(`Failed to create user profile: ${profileError.message}`);
    }

    // console.log(`✅ User profile created successfully: ${profileData.id}`);

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
      console.log(`✅ Invitation email sent successfully to ${userEmail}`);
    } catch (emailError) {
      console.error(`❌ Failed to send invitation email to ${userEmail}:`, emailError);
      // Don't fail the entire operation if email fails
      // The user was created successfully, just log the email error
    }

    console.log(`🎉 User invitation process completed successfully for: ${userEmail}`);
    
    return { 
      success: true, 
      user: profileData,
      temporaryPassword // Return for admin reference (consider security implications)
    };
  } catch (error) {
    console.error('❌ Error in inviteAndGrantBetaAccess:', error);
    console.error('❌ Stack trace:', error.stack);
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