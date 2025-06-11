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
                // invoice.customer = stripe customer id
                await markSubscriptionInactive(invoice.customer);
                break;
            }

            case 'invoice.payment_succeeded': {
                const invoice = event.data.object;
                const stripeCustomerId = invoice.customer;
                const subscriptionId = invoice.subscription;

                await resetQuotaOnBillingCycle(stripeCustomerId, subscriptionId);
                break;
            }


            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                await markSubscriptionInactive(subscription.customer);
                break;
            }

            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                const stripeCustomerId = subscription.customer;
                const newProductId = subscription.items.data[0].price.product;

                await updateSubscriptionPlan(stripeCustomerId, newProductId);
                break;
            }

            default:
                console.log(`Unhandled event type ${event.type}`);
        }

        response.json({ received: true });
    } catch (err) {
        console.error('Error handling webhook event:', err);
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
