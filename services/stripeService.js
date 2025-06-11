const stripe = require("../config/stripeClient");
const supabase = require("../config/supabaseClient");
const { PLAN_QUOTAS, PLAN_ID_MAP } = require("../constants");

async function saveSubscription({ userId, stripeCustomerId, stripeSubscriptionId, productId }) {
  try {
    const plan = PLAN_ID_MAP[productId]; 
    const quota = PLAN_QUOTAS[plan];

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
    const plan = PLAN_ID_MAP[newProductId];

    if (!plan) {
      console.error(`Invalid product ID "${newProductId}" or plan not found in mapping.`);
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        subscription_plan: plan,
        // only update subscription_plan
      })
      .eq('stripe_customer_id', stripeCustomerId);

    if (error) {
      console.error("Error updating subscription plan:", error.message);
    } else {
      console.log(`✅ Updated subscription plan to "${plan}" for customer ${stripeCustomerId}`);
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
    // Retrieve subscription to get current plan's price id
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const newPriceId = subscription.items.data[0].price.id;

    const plan = PLAN_ID_MAP[newPriceId];
    const quota = PLAN_QUOTAS[plan];

    if (!plan || !quota) {
      console.error(`Invalid plan or quota for price ID "${newPriceId}"`);
      return;
    }

    // Reset quota and quota_last_reset at billing cycle renewal
      const { error } = await supabase
          .from('profiles')
          .update({
              is_active: true,
              subscription_quota: quota,
              quota_last_reset: new Date(),
          })
          .eq('stripe_customer_id', stripeCustomerId);

      if (error) {
          console.error('Failed to reset quota on billing cycle renewal:', error.message);
      } else {
          console.log(`✅ Quota reset for customer ${stripeCustomerId} at billing cycle renewal.`);
      }
  } catch (err) {
    console.error('Unexpected error in resetQuotaOnBillingCycle:', err.message);
  }
}



module.exports = { saveSubscription, markSubscriptionInactive, updateSubscriptionPlan, resetQuotaOnBillingCycle };
