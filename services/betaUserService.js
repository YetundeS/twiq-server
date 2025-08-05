const { supabase } = require("../config/supabaseClient");
const { PLAN_QUOTAS } = require("../constants");

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

module.exports = {
  grantBetaAccess,
  checkBetaStatus,
  getBetaUsers,
  revokeBetaAccess,
  handleExpiredBetaUsers,
  getBetaExpiringUsers,
  convertBetaToPaid
};