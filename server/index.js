require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { clerkMiddleware, getAuth } = require('@clerk/express');
const { 
  saveSubscriber, 
  getSubscriberByClerkIdOrEmail, 
  getMonitoredPagesForSubscriber, 
  saveAds, 
  getTierLimits,
  updateUserTier,
  addMonitoredCompetitor,
  removeMonitoredCompetitor,
  getSavedSwipeAds,
  saveAdToSwipeFile,
  removeAdFromSwipeFile
} = require('./db');
const { scrapeCompetitor } = require('./scraper');
const { sendWelcomeAlertConfirmation } = require('./resend');
const { syncLeadToMailerLite } = require('./mailerlite');
const { sanitizeAndDeduplicateCompetitors, validateAndCleanCompetitor, validateEmail, validateName } = require('./validator');
const { createCheckoutSession, handleStripeWebhook, TIER_PRICING } = require('./stripe');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Stripe webhook needs raw body before standard json parser
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event;

    if (webhookSecret && sig) {
      const Stripe = require('stripe');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body.toString());
    }

    await handleStripeWebhook(event);
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Rate limiter for analysis endpoint (35 requests per 15 mins per IP)
const analyzeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 35,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many analysis requests from this IP. Please try again in 15 minutes.' }
});

// Apply Clerk Auth Middleware
const clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || 'pk_test_dG91Y2hpbmctaG9yc2UtMzI5MS5jbGVyay5hY2NvdW50cy5kZXYk';
const clerkSecretKey = process.env.CLERK_SECRET_KEY || 'sk_test_DipZOEnh0g2592EqpqbxqunsLTELeWoLZdXaBD22o1';

if (clerkPublishableKey) {
  app.use(clerkMiddleware({
    publishableKey: clerkPublishableKey,
    secretKey: clerkSecretKey
  }));
}

// Serve static frontend assets
app.use(express.static(path.join(__dirname, '..')));

// Health Check for Railway
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get Current User Profile, Tier & Saved Monitored Competitors
app.get('/api/me', async (req, res) => {
  try {
    const auth = getAuth(req);
    const userId = auth?.userId;

    if (!userId) {
      const guestLimits = getTierLimits('guest');
      return res.json({ 
        authenticated: false, 
        tierInfo: { tier: 'guest', limits: guestLimits, slotsUsed: 0, slotsTotal: guestLimits.maxCompetitors }
      });
    }

    const subscriber = getSubscriberByClerkIdOrEmail(userId, null);
    const userTier = subscriber?.tier || 'free';
    const limits = getTierLimits(userTier);

    if (!subscriber) {
      return res.json({ 
        authenticated: true, 
        subscriber: null, 
        monitoredCompetitors: [],
        swipeAds: [],
        tierInfo: { tier: userTier, limits, slotsUsed: 0, slotsTotal: limits.maxCompetitors }
      });
    }

    const pages = getMonitoredPagesForSubscriber(subscriber.id);
    const competitors = pages.map(p => p.page_name);
    const swipeAds = getSavedSwipeAds(subscriber.id);

    let reports = [];
    if (competitors.length > 0) {
      const rawReports = await Promise.all(competitors.map(c => scrapeCompetitor(c)));
      reports = rawReports.filter(Boolean).map(report => {
        if (report && report.ads) {
          return {
            ...report,
            ads: report.ads.slice(0, limits.maxAdsPerBrand)
          };
        }
        return report;
      });
    }

    return res.json({
      authenticated: true,
      subscriber,
      monitoredCompetitors: competitors,
      monitoredPages: pages,
      swipeAds,
      tierInfo: {
        tier: userTier,
        limits,
        slotsUsed: competitors.length,
        slotsTotal: limits.maxCompetitors
      },
      reports
    });
  } catch (error) {
    console.error('Error in /api/me:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// Add Competitor Slot (Protected)
app.post('/api/competitors', async (req, res) => {
  try {
    const auth = getAuth(req);
    const userId = auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required to manage slots.' });
    }

    const subscriber = getSubscriberByClerkIdOrEmail(userId, null);
    if (!subscriber) {
      return res.status(404).json({ error: 'User profile not found.' });
    }

    const userTier = subscriber.tier || 'free';
    const limits = getTierLimits(userTier);
    const currentPages = getMonitoredPagesForSubscriber(subscriber.id);

    if (currentPages.length >= limits.maxCompetitors) {
      return res.status(403).json({ 
        error: `Slot limit reached (${limits.maxCompetitors} max for ${limits.tierName}). Please upgrade your plan to add more competitors.` 
      });
    }

    const validation = validateAndCleanCompetitor(req.body.competitor);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const newPage = addMonitoredCompetitor(subscriber.id, validation.handle);
    const report = await scrapeCompetitor(validation.handle);

    res.json({ success: true, page: newPage, report });
  } catch (err) {
    console.error('Add competitor error:', err);
    res.status(500).json({ error: 'Failed to add competitor slot' });
  }
});

// Remove Competitor Slot (Protected)
app.delete('/api/competitors/:idOrName', async (req, res) => {
  try {
    const auth = getAuth(req);
    const userId = auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const subscriber = getSubscriberByClerkIdOrEmail(userId, null);
    if (!subscriber) {
      return res.status(404).json({ error: 'User profile not found.' });
    }

    const removed = removeMonitoredCompetitor(subscriber.id, req.params.idOrName);
    res.json({ success: removed });
  } catch (err) {
    console.error('Delete competitor error:', err);
    res.status(500).json({ error: 'Failed to remove competitor' });
  }
});

// Swipe File: Get Saved Ads
app.get('/api/swipe-file', async (req, res) => {
  try {
    const auth = getAuth(req);
    const userId = auth?.userId;
    if (!userId) return res.json({ swipeAds: [] });

    const subscriber = getSubscriberByClerkIdOrEmail(userId, null);
    if (!subscriber) return res.json({ swipeAds: [] });

    const swipeAds = getSavedSwipeAds(subscriber.id);
    res.json({ swipeAds });
  } catch (err) {
    console.error('Swipe file read error:', err);
    res.status(500).json({ error: 'Failed to fetch swipe file' });
  }
});

// Swipe File: Save Ad
app.post('/api/swipe-file', async (req, res) => {
  try {
    const auth = getAuth(req);
    const userId = auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Please sign in to save ads to your swipe file.' });
    }

    const subscriber = getSubscriberByClerkIdOrEmail(userId, null);
    if (!subscriber) {
      return res.status(404).json({ error: 'User profile not found.' });
    }

    const userTier = subscriber.tier || 'free';
    const limits = getTierLimits(userTier);
    const currentSwipe = getSavedSwipeAds(subscriber.id);

    if (currentSwipe.length >= limits.maxSwipeAds) {
      return res.status(403).json({ 
        error: `Swipe file limit reached (${limits.maxSwipeAds} max for ${limits.tierName}). Please upgrade to save more ads.` 
      });
    }

    const savedAd = saveAdToSwipeFile(subscriber.id, req.body);
    res.json({ success: true, ad: savedAd });
  } catch (err) {
    console.error('Save ad error:', err);
    res.status(500).json({ error: 'Failed to save ad to swipe file' });
  }
});

// Swipe File: Delete Saved Ad
app.delete('/api/swipe-file/:id', async (req, res) => {
  try {
    const auth = getAuth(req);
    const userId = auth?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required.' });

    const subscriber = getSubscriberByClerkIdOrEmail(userId, null);
    if (!subscriber) return res.status(404).json({ error: 'User profile not found.' });

    const removed = removeAdFromSwipeFile(subscriber.id, req.params.id);
    res.json({ success: removed });
  } catch (err) {
    console.error('Delete swipe error:', err);
    res.status(500).json({ error: 'Failed to delete saved ad' });
  }
});

// Create Stripe Checkout Session
app.post('/api/billing/create-checkout-session', async (req, res) => {
  try {
    const auth = getAuth(req);
    const userId = auth?.userId;
    const { tier, billingCycle } = req.body;

    let userEmail = null;
    if (userId) {
      const sub = getSubscriberByClerkIdOrEmail(userId, null);
      userEmail = sub?.email || null;
    }

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    const session = await createCheckoutSession({
      userId,
      userEmail,
      tier: tier || 'starter',
      billingCycle: billingCycle || 'monthly',
      baseUrl
    });

    res.json({ url: session.url, sessionId: session.sessionId });
  } catch (error) {
    console.error('Checkout Session Error:', error);
    res.status(500).json({ error: 'Failed to initiate checkout session' });
  }
});

// Main Analysis & Monitoring Signup API Endpoint
app.post('/api/analyze', analyzeLimiter, async (req, res) => {
  try {
    // 1. Honeypot check: silently ignore automated bots
    if (req.body.website) {
      return res.json({
        success: true,
        subscriber: null,
        monitoredCompetitors: [],
        reports: [],
        summary: { totalCompetitors: 0, totalActiveAdsAnalyzed: 0, primaryMarket: 'Malaysia (MY)', monitoringActive: false }
      });
    }

    const auth = getAuth(req);
    const userId = auth?.userId;
    const { name, email, company, competitors } = req.body;

    // Determine current tier and limits
    let currentTier = 'guest';
    let existingSubscriber = null;
    if (userId) {
      existingSubscriber = getSubscriberByClerkIdOrEmail(userId, email);
      currentTier = existingSubscriber?.tier || 'free';
    } else if (email && email.includes('@')) {
      existingSubscriber = getSubscriberByClerkIdOrEmail(null, email);
      currentTier = existingSubscriber?.tier || 'free';
    }

    const tierLimits = getTierLimits(currentTier);

    // 2. Validate and clean competitor inputs using tier slot limit
    if (!competitors || !Array.isArray(competitors) || competitors.length === 0) {
      return res.status(400).json({ 
        error: 'Please provide at least 1 competitor Facebook Page URL or handle.' 
      });
    }

    const { validCompetitors, errors } = sanitizeAndDeduplicateCompetitors(competitors, tierLimits.maxCompetitors);

    if (validCompetitors.length === 0) {
      return res.status(400).json({ 
        error: errors[0] || 'No valid Facebook Page or Instagram profile URLs found. Please check your links.' 
      });
    }

    // 3. Optional validation for email and name if provided
    let cleanEmail = null;
    let cleanName = null;

    if (email && email.trim().length > 0) {
      const emailValidation = validateEmail(email);
      if (!emailValidation.valid) {
        return res.status(400).json({ error: emailValidation.error });
      }
      cleanEmail = emailValidation.email;

      if (name && name.trim().length > 0) {
        const nameValidation = validateName(name);
        if (!nameValidation.valid) {
          return res.status(400).json({ error: nameValidation.error });
        }
        cleanName = nameValidation.name;
      }
    }

    // 4. Run Scraper Engine in parallel for all competitors
    const scrapingPromises = validCompetitors.map(c => scrapeCompetitor(c));
    const rawResults = await Promise.all(scrapingPromises);
    
    // Slice sample ads per competitor to match tier entitlement
    const reports = rawResults.filter(Boolean).map(report => {
      if (report && report.ads) {
        return {
          ...report,
          ads: report.ads.slice(0, tierLimits.maxAdsPerBrand)
        };
      }
      return report;
    });

    // 5. Save extracted ads into DB
    for (const report of reports) {
      if (report && report.ads) {
        saveAds(report.brandName || report.query, report.ads);
      }
    }

    let subscriber = null;

    // 6. If user provided email, register them in DB & send welcome alert confirmation
    if (cleanEmail) {
      subscriber = saveSubscriber(cleanEmail, cleanName || '', company || cleanName || '', validCompetitors, userId, currentTier);

      sendWelcomeAlertConfirmation(cleanEmail, cleanName, company || cleanName, validCompetitors).catch(err => {
        console.error('Resend background error:', err);
      });

      syncLeadToMailerLite({ email: cleanEmail, name: cleanName, company: company || cleanName }).catch(err => {
        console.error('MailerLite sync background error:', err);
      });
    }

    return res.json({
      success: true,
      subscriber,
      monitoredCompetitors: validCompetitors,
      reports,
      tierInfo: {
        tier: currentTier,
        limits: tierLimits,
        slotsUsed: validCompetitors.length,
        slotsTotal: tierLimits.maxCompetitors
      },
      summary: {
        totalCompetitors: reports.length,
        totalActiveAdsAnalyzed: reports.reduce((acc, r) => acc + (r.metrics?.activeAdsCount || 0), 0),
        primaryMarket: 'Malaysia (MY)',
        monitoringActive: !!subscriber
      }
    });
  } catch (error) {
    console.error('Analysis Endpoint Error:', error);
    return res.status(500).json({ error: 'Failed to complete analysis. Please try again.' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Marvelop AdSpy server running on port ${PORT}`);
});
