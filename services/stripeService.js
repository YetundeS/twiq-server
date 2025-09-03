const stripe = require("../config/stripeClient");
const { supabase } = require("../config/supabaseClient");
const { PLAN_QUOTAS, PLAN_ID_MAP, isUpgrade, isDowngrade } = require("../constants");

async function saveSubscription({ userId, stripeCustomerId, stripeSubscriptionId, productId }) {
  try {
    const plan = PLAN_ID_MAP[productId]
    const quota = PLAN_QUOTAS[plan]

    if (!quota) {
      console.error(`Invalid plan "${plan}" passed to saveSubscription`);
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        subscription_plan: plan,   
        is_active: true,
        subscription_quota: quota,
        quota_last_reset: new Date(),
      })
      .eq('id', userId);

    if (error) {
      console.error('Error updating user subscription:', error.message);
    }
  } catch (err) {
    console.error('Unexpected error in saveSubscription:', err);
  }
}

async function markSubscriptionInactive(stripeCustomerId) {
  if (!stripeCustomerId) {
    console.error("No Stripe customer ID provided to markSubscriptionInactive");
    return;
  }

  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        is_active: false,
        subscription_plan: null,
        subscription_quota: null,
        quota_last_reset: null,
        stripe_subscription_id: null,
      })
      .eq('stripe_customer_id', stripeCustomerId);

    if (error) {
      console.error('Failed to mark subscription inactive:', error.message);
    } else {
      console.log(`Successfully marked subscription as inactive for customer: ${stripeCustomerId}`);
    }
  } catch (err) {
    console.error('Unexpected error in markSubscriptionInactive:', err.message);
  }
}

async function updateSubscriptionPlan(stripeCustomerId, newProductId) {
  if (!stripeCustomerId || !newProductId) {
    console.error("Missing parameters in updateSubscriptionPlan");
    return;
  }

  try {
    const newPlan = PLAN_ID_MAP[newProductId];
    const newQuota = PLAN_QUOTAS[newPlan];

    if (!newPlan || !newQuota) {
      console.error(`Invalid product ID "${newProductId}" or plan not found in mapping.`);
      return;
    }

    // First, get current user data
    const { data: currentUser, error: fetchError } = await supabase
      .from('profiles')
      .select('subscription_plan, subscription_quota, stripe_subscription_id')
      .eq('stripe_customer_id', stripeCustomerId)
      .single();

    if (fetchError) {
      console.error('Error fetching current user data:', fetchError.message);
      return;
    }

    const currentPlan = currentUser?.subscription_plan;
    
    // Determine if this is an upgrade or downgrade
    const isUpgradeFlow = isUpgrade(currentPlan, newPlan);
    const isDowngradeFlow = isDowngrade(currentPlan, newPlan);

    if (isUpgradeFlow) {
      // UPGRADE: Apply immediately - user gets better service right away
      console.log(`⬆️ UPGRADE detected: ${currentPlan} → ${newPlan}. Applying immediately.`);
      
      const { error } = await supabase
        .from('profiles')
        .update({
          subscription_plan: newPlan,
          subscription_quota: newQuota,
          quota_last_reset: new Date(),
          // Clear any pending changes since we're upgrading now
          pending_plan_change: null,
          plan_change_effective_date: null,
        })
        .eq('stripe_customer_id', stripeCustomerId);

      if (error) {
        console.error("Error applying upgrade:", error.message);
      } else {
        console.log(`✅ UPGRADE applied: ${currentPlan} → ${newPlan} for customer ${stripeCustomerId}`);
      }
      
    } else if (isDowngradeFlow) {
      // DOWNGRADE: Schedule for next billing cycle - user keeps current quota until then
      console.log(`⬇️ DOWNGRADE detected: ${currentPlan} → ${newPlan}. Scheduling for next billing cycle.`);
      
      // Get next billing date from Stripe subscription
      const subscription = await stripe.subscriptions.retrieve(currentUser.stripe_subscription_id);
      const nextBillingDate = new Date(subscription.current_period_end * 1000);
      
      const { error } = await supabase
        .from('profiles')
        .update({
          // Keep current plan and quota until next billing cycle
          pending_plan_change: newPlan,
          plan_change_effective_date: nextBillingDate,
        })
        .eq('stripe_customer_id', stripeCustomerId);

      if (error) {
        console.error("Error scheduling downgrade:", error.message);
      } else {
        console.log(`✅ DOWNGRADE scheduled: ${currentPlan} → ${newPlan} effective ${nextBillingDate.toISOString()} for customer ${stripeCustomerId}`);
      }
      
    } else {
      // Same plan level (maybe different billing frequency) - just update
      console.log(`↔️ LATERAL change: ${currentPlan} → ${newPlan}. Applying immediately.`);
      
      const { error } = await supabase
        .from('profiles')
        .update({
          subscription_plan: newPlan,
          subscription_quota: newQuota,
          quota_last_reset: new Date(),
          pending_plan_change: null,
          plan_change_effective_date: null,
        })
        .eq('stripe_customer_id', stripeCustomerId);

      if (error) {
        console.error("Error applying lateral change:", error.message);
      } else {
        console.log(`✅ LATERAL change applied: ${currentPlan} → ${newPlan} for customer ${stripeCustomerId}`);
      }
    }
  } catch (err) {
    console.error("Unexpected error in updateSubscriptionPlan:", err.message);
  }
}



async function resetQuotaOnBillingCycle(stripeCustomerId, subscriptionId) {
  if (!stripeCustomerId || !subscriptionId) {
    console.error('Missing stripeCustomerId or subscriptionId in resetQuotaOnBillingCycle');
    return;
  }

  try {
    // First, check if user has pending plan changes
    const { data: currentUser, error: fetchError } = await supabase
      .from('profiles')
      .select('subscription_plan, pending_plan_change, plan_change_effective_date')
      .eq('stripe_customer_id', stripeCustomerId)
      .single();

    if (fetchError) {
      console.error('Error fetching user for billing cycle reset:', fetchError.message);
      return;
    }

    let planToUse = currentUser?.subscription_plan;
    let shouldApplyPendingChange = false;

    // Check if we should apply a pending plan change
    if (currentUser?.pending_plan_change && currentUser?.plan_change_effective_date) {
      const effectiveDate = new Date(currentUser.plan_change_effective_date);
      const now = new Date();
      
      // If the effective date has passed, apply the pending change
      if (effectiveDate <= now) {
        planToUse = currentUser.pending_plan_change;
        shouldApplyPendingChange = true;
        console.log(`🔄 APPLYING pending plan change: ${currentUser.subscription_plan} → ${planToUse} (effective date passed)`);
      } else {
        console.log(`⏳ Pending plan change exists but not yet effective: ${currentUser.subscription_plan} → ${currentUser.pending_plan_change} (effective: ${effectiveDate.toISOString()})`);
      }
    }

    // Get quota for the plan we should use
    const quota = PLAN_QUOTAS[planToUse];

    if (!planToUse || !quota) {
      console.error(`Invalid plan "${planToUse}" for quota reset. Available plans: ${Object.keys(PLAN_QUOTAS).join(', ')}`);
      return;
    }

    console.log(`🔄 Resetting quota for plan "${planToUse}" with quota:`, quota);

    // Prepare update object
    const updateData = {
      is_active: true,
      subscription_quota: quota,
      quota_last_reset: new Date(),
    };

    // If we're applying a pending change, update the plan and clear pending fields
    if (shouldApplyPendingChange) {
      updateData.subscription_plan = planToUse;
      updateData.pending_plan_change = null;
      updateData.plan_change_effective_date = null;
      console.log(`✅ Applying pending plan change during billing cycle reset`);
    }

    // Apply the update
    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('stripe_customer_id', stripeCustomerId);

    if (error) {
      console.error('Failed to reset quota on billing cycle renewal:', error.message);
    } else {
      const action = shouldApplyPendingChange ? 'Quota reset AND pending plan change applied' : 'Quota reset';
      console.log(`✅ ${action} for customer ${stripeCustomerId} - Plan: ${planToUse}`);
    }
  } catch (err) {
    console.error('Unexpected error in resetQuotaOnBillingCycle:', err.message);
  }
}



module.exports = { saveSubscription, markSubscriptionInactive, updateSubscriptionPlan, resetQuotaOnBillingCycle };
