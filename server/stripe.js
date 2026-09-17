const Stripe = require('stripe');
const { updateUserTier, getSubscriberByClerkIdOrEmail } = require('./db');

const stripeKey = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder';
const stripe = new Stripe(stripeKey, {
  apiVersion: '2023-10-16'
});

const TIER_PRICING = {
  starter: {
    name: 'Marvelop AdSpy Starter Plan',
    monthly: { amount: 4900, currency: 'myr', label: 'RM49 / month' },
    yearly: { amount: 39900, currency: 'myr', label: 'RM399 / year (Save 2 months)' }
  },
  pro: {
    name: 'Marvelop AdSpy Pro / Agency Plan',
    monthly: { amount: 9900, currency: 'myr', label: 'RM99 / month' },
    yearly: { amount: 79900, currency: 'myr', label: 'RM799 / year (Save 2 months)' }
  }
};

async function createCheckoutSession({ userId, userEmail, tier = 'starter', billingCycle = 'monthly', baseUrl = 'http://localhost:3000' }) {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('[Stripe] STRIPE_SECRET_KEY not set. Returning simulated checkout URL.');
    // Demo fallback for local testing
    return {
      url: `${baseUrl}/?upgraded=true&tier=${tier}`,
      simulated: true
    };
  }

  const selectedTier = TIER_PRICING[tier] || TIER_PRICING.starter;
  const pricing = billingCycle === 'yearly' ? selectedTier.yearly : selectedTier.monthly;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'subscription',
    customer_email: userEmail || undefined,
    client_reference_id: userId || undefined,
    metadata: {
      userId: userId || '',
      userEmail: userEmail || '',
      tier,
      billingCycle
    },
    line_items: [
      {
        price_data: {
          currency: pricing.currency,
          product_data: {
            name: selectedTier.name,
            description: `Unlocks ${tier === 'pro' ? '25' : '10'} tracked competitors, full ad archive & launch alerts.`
          },
          unit_amount: pricing.amount,
          recurring: {
            interval: billingCycle === 'yearly' ? 'year' : 'month'
          }
        },
        quantity: 1
      }
    ],
    success_url: `${baseUrl}/?upgraded=true&tier=${tier}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/#pricing`
  });

  return {
    url: session.url,
    sessionId: session.id
  };
}

async function handleStripeWebhook(event) {
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id || session.metadata?.userId;
        const email = session.customer_email || session.metadata?.userEmail;
        const tier = session.metadata?.tier || 'starter';
        const billingCycle = session.metadata?.billingCycle || 'monthly';

        updateUserTier(userId, email, tier, {
          status: 'active',
          billingCycle,
          customerId: session.customer,
          subscriptionId: session.subscription
        });
        console.log(`[Stripe Webhook] Upgraded user ${email || userId} to ${tier}`);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        // Downgrade user back to free tier upon cancellation
        const customerId = subscription.customer;
        // Search subscriber by customerId
        break;
      }
    }
    return { received: true };
  } catch (error) {
    console.error('[Stripe Webhook Error]', error);
    throw error;
  }
}

module.exports = {
  stripe,
  createCheckoutSession,
  handleStripeWebhook,
  TIER_PRICING
};
