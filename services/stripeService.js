const stripe = require("../config/stripeClient");
const { supabase } = require("../config/supabaseClient");
const { PLAN_QUOTAS, PLAN_ID_MAP, isUpgrade, isDowngrade } = require("../constants");
const logger = require('../utils/logger');

async function saveSubscription({ userId, stripeCustomerId, stripeSubscriptionId, productId }) {
  try {
    const plan = PLAN_ID_MAP[productId]
    const quota = PLAN_QUOTAS[plan]

    if (!quota) {
      logger.logSystemError('Invalid plan passed to saveSubscription', new Error(`Invalid plan: ${plan}`), { plan, userId, stripeCustomerId, productId });
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
      logger.logSystemError('Error updating user subscription in saveSubscription', error, { userId, stripeCustomerId, stripeSubscriptionId, productId, plan });
    }
  } catch (err) {
    logger.logSystemError('Unexpected error in saveSubscription', err, { userId, stripeCustomerId, stripeSubscriptionId, productId });
  }
}

async function markSubscriptionInactive(stripeCustomerId) {
  if (!stripeCustomerId) {
    logger.logSystemError('No Stripe customer ID provided to markSubscriptionInactive', new Error('Missing stripeCustomerId'), {});
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
      logger.logSystemError('Failed to mark subscription inactive', error, { stripeCustomerId });
    } else {
      logger.logInfo(`Successfully marked subscription as inactive for customer: ${stripeCustomerId}`, { stripeCustomerId });
    }
  } catch (err) {
    logger.logSystemError('Unexpected error in markSubscriptionInactive', err, { stripeCustomerId });
  }
}

async function updateSubscriptionPlan(stripeCustomerId, newProductId) {
  if (!stripeCustomerId || !newProductId) {
    logger.logSystemError('Missing parameters in updateSubscriptionPlan', new Error('Missing parameters'), { stripeCustomerId, newProductId });
    return;
  }

  try {
    const newPlan = PLAN_ID_MAP[newProductId];
    const newQuota = PLAN_QUOTAS[newPlan];

    if (!newPlan || !newQuota) {
      logger.logSystemError('Invalid product ID or plan not found in mapping', new Error(`Invalid product ID: ${newProductId}`), { newProductId, stripeCustomerId });
      return;
    }

    // First, get current user data
    const { data: currentUser, error: fetchError } = await supabase
      .from('profiles')
      .select('subscription_plan, subscription_quota, stripe_subscription_id')
      .eq('stripe_customer_id', stripeCustomerId)
      .single();

    if (fetchError) {
      logger.logSystemError('Error fetching current user data in updateSubscriptionPlan', fetchError, { stripeCustomerId, newProductId });
      return;
    }

    const currentPlan = currentUser?.subscription_plan;
    
    // Determine if this is an upgrade or downgrade
    const isUpgradeFlow = isUpgrade(currentPlan, newPlan);
    const isDowngradeFlow = isDowngrade(currentPlan, newPlan);

    if (isUpgradeFlow) {
      // UPGRADE: Apply immediately - user gets better service right away
      logger.logInfo(`Upgrade detected: ${currentPlan} → ${newPlan}`, { currentPlan, newPlan, stripeCustomerId, action: 'upgrade' });
      
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
        logger.logSystemError('Error applying upgrade', error, { currentPlan, newPlan, stripeCustomerId });
      } else {
        logger.logInfo(`Upgrade applied: ${currentPlan} → ${newPlan} for customer ${stripeCustomerId}`, { currentPlan, newPlan, stripeCustomerId });
      }
      
    } else if (isDowngradeFlow) {
      // DOWNGRADE: Schedule for next billing cycle - user keeps current quota until then
      logger.logInfo(`Downgrade detected: ${currentPlan} → ${newPlan}`, { currentPlan, newPlan, stripeCustomerId, action: 'downgrade' });
      
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
        logger.logSystemError('Error scheduling downgrade', error, { currentPlan, newPlan, stripeCustomerId, nextBillingDate });
      } else {
        logger.logInfo(`Downgrade scheduled: ${currentPlan} → ${newPlan} effective ${nextBillingDate.toISOString()}`, { currentPlan, newPlan, stripeCustomerId, nextBillingDate });
      }
      
    } else {
      // Same plan level (maybe different billing frequency) - just update
      logger.logInfo(`Lateral change: ${currentPlan} → ${newPlan}`, { currentPlan, newPlan, stripeCustomerId, action: 'lateral' });
      
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
        logger.logSystemError('Error applying lateral change', error, { currentPlan, newPlan, stripeCustomerId });
      } else {
        logger.logInfo(`Lateral change applied: ${currentPlan} → ${newPlan} for customer ${stripeCustomerId}`, { currentPlan, newPlan, stripeCustomerId });
      }
    }
  } catch (err) {
    logger.logSystemError('Unexpected error in updateSubscriptionPlan', err, { stripeCustomerId, newProductId });
  }
}



async function resetQuotaOnBillingCycle(stripeCustomerId, subscriptionId) {
  if (!stripeCustomerId || !subscriptionId) {
    logger.logSystemError('Missing stripeCustomerId or subscriptionId in resetQuotaOnBillingCycle', new Error('Missing parameters'), { stripeCustomerId, subscriptionId });
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
      logger.logSystemError('Error fetching user for billing cycle reset', fetchError, { stripeCustomerId, subscriptionId });
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
        logger.logInfo(`Applying pending plan change: ${currentUser.subscription_plan} → ${planToUse}`, { currentPlan: currentUser.subscription_plan, newPlan: planToUse, stripeCustomerId, reason: 'effective date passed' });
      } else {
        logger.logInfo(`Pending plan change not yet effective: ${currentUser.subscription_plan} → ${currentUser.pending_plan_change}`, { currentPlan: currentUser.subscription_plan, pendingPlan: currentUser.pending_plan_change, effectiveDate: effectiveDate.toISOString(), stripeCustomerId });
      }
    }

    // Get quota for the plan we should use
    const quota = PLAN_QUOTAS[planToUse];

    if (!planToUse || !quota) {
      logger.logSystemError('Invalid plan for quota reset in billing cycle', new Error(`Invalid plan: ${planToUse}`), { planToUse, availablePlans: Object.keys(PLAN_QUOTAS), stripeCustomerId });
      return;
    }

    logger.logInfo(`Resetting quota for plan: ${planToUse}`, { planToUse, quota, stripeCustomerId });

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
      logger.logInfo('Applying pending plan change during billing cycle reset', { planToUse, stripeCustomerId });
    }

    // Apply the update
    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('stripe_customer_id', stripeCustomerId);

    if (error) {
      logger.logSystemError('Failed to reset quota on billing cycle renewal', error, { planToUse, stripeCustomerId, shouldApplyPendingChange });
    } else {
      const action = shouldApplyPendingChange ? 'Quota reset AND pending plan change applied' : 'Quota reset';
      logger.logInfo(`${action} for customer ${stripeCustomerId}`, { planToUse, stripeCustomerId, action, shouldApplyPendingChange });
    }
  } catch (err) {
    logger.logSystemError('Unexpected error in resetQuotaOnBillingCycle', err, { stripeCustomerId, subscriptionId });
  }
}



module.exports = { saveSubscription, markSubscriptionInactive, updateSubscriptionPlan, resetQuotaOnBillingCycle };
