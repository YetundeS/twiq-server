const stripe = require("../config/stripeClient");
const { supabase } = require("../config/supabaseClient");
const { saveSubscription, markSubscriptionInactive, updateSubscriptionPlan, resetQuotaOnBillingCycle } = require("../services/stripeService");


exports.createCheckoutSession = async (req, res) => {
    const { priceId } = req.body;

    // Assuming you have auth middleware that sets req.user
    const userId = req.user?.id;
    const userEmail = req.user?.email;

    if (!priceId) {
        return res.status(400).json({ error: 'Price Id is required.' });
    }

    if (!userId || !userEmail) {
        return res.status(401).json({ error: 'Unauthorized: User info missing.' });
    }

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            customer_email: userEmail,
            success_url: `${process.env.FRONTEND_URL}/stripe/success`,
            cancel_url: `${process.env.FRONTEND_URL}/stripe/cancel`,
            metadata: {
                userId,
            },
        });

        res.json({ url: session.url });
    } catch (err) {
        console.error("Checkout session creation error:", err);
        return res.status(500).json({ error: "Internal server error." });
    }
};



exports.trackSubscription = async (request, response) => {
    const sig = request.headers['stripe-signature'];
    let event;

    // Validate webhook signature
    try {
        event = stripe.webhooks.constructEvent(request.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
        console.log(`✅ Webhook signature verified for event: ${event.type}`);
    } catch (err) {
        console.error('❌ Webhook signature verification failed:', {
            error: err.message,
            signature: sig ? 'present' : 'missing',
            bodyLength: request.body ? request.body.length : 0
        });
        return response.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                console.log(`🔔 Processing checkout.session.completed: ${session.id}, mode: ${session.mode}`);

                // 🔍 CREDIT PURCHASE FLOW
                if (session.mode === 'payment' && session.metadata?.input_tokens) {
                    try {
                        const userId = session.metadata.user_id;
                        const inputToAdd = parseInt(session.metadata.input_tokens || '0', 10);
                        const outputToAdd = parseInt(session.metadata.output_tokens || '0', 10);
                        const cachedToAdd = parseInt(session.metadata.cached_tokens || '0', 10);

                        if (!userId) {
                            throw new Error('Missing user_id in session metadata for credit purchase');
                        }

                        console.log(`💳 Processing credit purchase for user ${userId}: ${inputToAdd} input, ${outputToAdd} output, ${cachedToAdd} cached tokens`);

                        const { data: user, error } = await supabase
                            .from('profiles')
                            .select('subscription_quota')
                            .eq('id', userId)
                            .single();

                        if (error) throw new Error(`Failed to fetch current quota: ${error.message}`);

                        const existingQuota = user.subscription_quota || {
                            input_tokens: 0,
                            output_tokens: 0,
                            cached_tokens: 0,
                            cached_input_tokens: 0, // Handle legacy field name
                        };

                        // Handle field name inconsistency between DB and frontend
                        const currentCachedTokens = existingQuota.cached_tokens || existingQuota.cached_input_tokens || 0;

                        const updatedQuota = {
                            input_tokens: existingQuota.input_tokens + inputToAdd,
                            output_tokens: existingQuota.output_tokens + outputToAdd,
                            cached_tokens: currentCachedTokens + cachedToAdd,
                        };

                        const { error: updateError } = await supabase
                            .from('profiles')
                            .update({ subscription_quota: updatedQuota })
                            .eq('id', userId);

                        if (updateError) throw new Error(`Failed to update quota: ${updateError.message}`);

                        console.log(`✅ Credited tokens to user ${userId}: ${JSON.stringify(updatedQuota)}`);
                        break;
                    } catch (creditError) {
                        console.error('❌ Error processing credit purchase:', creditError.message);
                        // Continue processing - don't fail the entire webhook
                        break;
                    }
                }

                // 🔄 SUBSCRIPTION FLOW
                try {
                    const userId = session.metadata.userId;
                    
                    if (!userId) {
                        throw new Error('Missing userId in session metadata for subscription');
                    }

                    if (!session.subscription) {
                        throw new Error('Missing subscription ID in completed session');
                    }

                    console.log(`📊 Processing subscription for user ${userId}, subscription: ${session.subscription}`);

                    const subscription = await stripe.subscriptions.retrieve(session.subscription);
                    const productId = subscription.items.data[0]?.price?.product;

                    if (!productId) {
                        throw new Error('Missing product ID in subscription');
                    }

                    await saveSubscription({
                        userId,
                        stripeCustomerId: session.customer,
                        stripeSubscriptionId: session.subscription,
                        productId,
                    });

                    console.log(`✅ Saved subscription for user ${userId}, customer: ${session.customer}, product: ${productId}`);
                } catch (subscriptionError) {
                    console.error('❌ Error processing subscription:', subscriptionError.message);
                    // Continue processing - don't fail the entire webhook
                }

                break;
            }

            case 'invoice.payment_failed': {
                try {
                    const invoice = event.data.object;
                    console.log(`💸 Processing payment failure for customer: ${invoice.customer}`);
                    
                    if (!invoice.customer) {
                        throw new Error('Missing customer ID in payment failure event');
                    }

                    await markSubscriptionInactive(invoice.customer);
                    console.log(`✅ Marked subscription inactive for customer: ${invoice.customer}`);
                } catch (error) {
                    console.error('❌ Error processing payment failure:', error.message);
                }
                break;
            }

            case 'invoice.payment_succeeded': {
                try {
                    const invoice = event.data.object;
                    console.log(`💰 Processing payment success for customer: ${invoice.customer}, subscription: ${invoice.subscription}`);
                    
                    if (!invoice.customer || !invoice.subscription) {
                        throw new Error('Missing customer ID or subscription ID in payment success event');
                    }

                    await resetQuotaOnBillingCycle(invoice.customer, invoice.subscription);
                    console.log(`✅ Reset quota for customer: ${invoice.customer}`);
                } catch (error) {
                    console.error('❌ Error processing payment success:', error.message);
                }
                break;
            }

            case 'customer.subscription.deleted': {
                try {
                    const subscription = event.data.object;
                    console.log(`🗑️ Processing subscription deletion for customer: ${subscription.customer}`);
                    
                    if (!subscription.customer) {
                        throw new Error('Missing customer ID in subscription deletion event');
                    }

                    await markSubscriptionInactive(subscription.customer);
                    console.log(`✅ Marked subscription inactive after deletion for customer: ${subscription.customer}`);
                } catch (error) {
                    console.error('❌ Error processing subscription deletion:', error.message);
                }
                break;
            }

            case 'customer.subscription.updated': {
                try {
                    const subscription = event.data.object;
                    const productId = subscription.items.data[0]?.price?.product;
                    
                    console.log(`🔄 Processing subscription update for customer: ${subscription.customer}, new product: ${productId}`);
                    
                    if (!subscription.customer || !productId) {
                        throw new Error('Missing customer ID or product ID in subscription update event');
                    }

                    await updateSubscriptionPlan(subscription.customer, productId);
                    console.log(`✅ Updated subscription plan for customer: ${subscription.customer} to product: ${productId}`);
                } catch (error) {
                    console.error('❌ Error processing subscription update:', error.message);
                }
                break;
            }

            default:
                console.log(`⚠️ Unhandled event type: ${event.type} - Event ID: ${event.id}`);
        }

        response.json({ received: true });
    } catch (err) {
        console.error('❌ Critical webhook handler error:', {
            error: err.message,
            stack: err.stack,
            eventType: event?.type,
            eventId: event?.id,
            timestamp: new Date().toISOString()
        });
        response.status(500).json({ 
            error: 'Webhook processing failed',
            eventId: event?.id,
            timestamp: new Date().toISOString()
        });
    }
};




exports.createBillingPortalSession = async (req, res) => {
    const { stripeCustomerId } = req.body;  // or get from req.user if you saved it

    if (!stripeCustomerId) {
        return res.status(400).json({ error: 'Missing Stripe Customer ID' });
    }

    try {
        const portalSession = await stripe.billingPortal.sessions.create({
            customer: stripeCustomerId,
            return_url: process.env.FRONTEND_URL + '/dashboard', // or any page you want user redirected after managing
        });

        res.json({ url: portalSession.url });
    } catch (err) {
        console.error('Failed to create billing portal session:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};




exports.buyTWIQCredit = async (req, res) => {
    const { bundle } = req.body;
    const user_id = req.user?.id;

    if (!user_id || !bundle || !bundle.price) {
        return res.status(400).json({ error: 'Invalid bundle or user.' });
    }

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        unit_amount: bundle.price,
                        product_data: {
                            name: `TWIQ Token Bundle - ${bundle.label}`,
                            description: `${bundle.input_tokens} input, ${bundle.output_tokens} output, ${bundle.cached_tokens} cached tokens`,
                        },
                    },
                    quantity: 1,
                },
            ],
            metadata: {
                user_id,
                input_tokens: bundle.input_tokens,
                output_tokens: bundle.output_tokens,
                cached_tokens: bundle.cached_tokens,
            },
            success_url: `${process.env.FRONTEND_URL}/stripe/success`,
            cancel_url: `${process.env.FRONTEND_URL}/stripe/cancel`,
        });

        return res.status(200).json({ url: session.url });
    } catch (error) {
        console.error('Stripe Checkout Error:', error);
        return res.status(500).json({ error: 'Failed to create checkout session' });
    }
};
