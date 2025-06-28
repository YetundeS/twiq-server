const stripe = require("../config/stripeClient");
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

    try {
        event = stripe.webhooks.constructEvent(request.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return response.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;

                // 🔍 CREDIT PURCHASE FLOW
                if (session.mode === 'payment' && session.metadata?.input_tokens) {
                    const userId = session.metadata.user_id;
                    const inputToAdd = parseInt(session.metadata.input_tokens || '0', 10);
                    const outputToAdd = parseInt(session.metadata.output_tokens || '0', 10);
                    const cachedToAdd = parseInt(session.metadata.cached_tokens || '0', 10);

                    const { data: user, error } = await supabase
                        .from('profiles')
                        .select('subscription_quota')
                        .eq('id', userId)
                        .single();

                    if (error) throw new Error('Failed to fetch current quota');

                    const existingQuota = user.subscription_quota || {
                        input_tokens: 0,
                        output_tokens: 0,
                        cached_tokens: 0,
                    };

                    const updatedQuota = {
                        input_tokens: existingQuota.input_tokens + inputToAdd,
                        output_tokens: existingQuota.output_tokens + outputToAdd,
                        cached_tokens: existingQuota.cached_tokens + cachedToAdd,
                    };

                    const { error: updateError } = await supabase
                        .from('profiles')
                        .update({ subscription_quota: updatedQuota })
                        .eq('id', userId);

                    if (updateError) throw new Error(updateError.message);

                    console.log(`✅ Credited tokens to user ${userId}`);
                    break;
                }


                // 🔄 SUBSCRIPTION FLOW
                const userId = session.metadata.userId;
                const subscription = await stripe.subscriptions.retrieve(session.subscription);
                const productId = subscription.items.data[0].price.product;

                await saveSubscription({
                    userId,
                    stripeCustomerId: session.customer,
                    stripeSubscriptionId: session.subscription,
                    productId,
                });

                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                await markSubscriptionInactive(invoice.customer);
                break;
            }

            case 'invoice.payment_succeeded': {
                const invoice = event.data.object;
                await resetQuotaOnBillingCycle(invoice.customer, invoice.subscription);
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                await markSubscriptionInactive(subscription.customer);
                break;
            }

            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                await updateSubscriptionPlan(
                    subscription.customer,
                    subscription.items.data[0].price.product
                );
                break;
            }

            default:
                console.log(`Unhandled event type ${event.type}`);
        }

        response.json({ received: true });
    } catch (err) {
        console.error('Webhook handler error:', err);
        response.status(500).send('Webhook handler error');
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
