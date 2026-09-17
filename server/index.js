require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { clerkMiddleware, getAuth } = require('@clerk/express');
const { saveSubscriber, getSubscriberByClerkIdOrEmail, getMonitoredPagesForSubscriber, saveAds } = require('./db');
const { scrapeCompetitor } = require('./scraper');
const { sendWelcomeAlertConfirmation } = require('./resend');
const { syncLeadToMailerLite } = require('./mailerlite');
const { sanitizeAndDeduplicateCompetitors, validateEmail, validateName } = require('./validator');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Rate limiter for analysis endpoint (20 requests per 15 mins per IP)
const analyzeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many analysis requests from this IP. Please try again in 15 minutes.' }
});

// Apply Clerk Auth Middleware (falls back gracefully if running in local demo mode)
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

// Get Current User Profile & Saved Monitored Competitors
app.get('/api/me', async (req, res) => {
  try {
    const auth = getAuth(req);
    const userId = auth?.userId;

    if (!userId) {
      return res.json({ authenticated: false });
    }

    const subscriber = getSubscriberByClerkIdOrEmail(userId, null);
    if (!subscriber) {
      return res.json({ authenticated: true, subscriber: null, monitoredCompetitors: [] });
    }

    const pages = getMonitoredPagesForSubscriber(subscriber.id);
    const competitors = pages.map(p => p.page_name);

    let reports = [];
    if (competitors.length > 0) {
      reports = await Promise.all(competitors.map(c => scrapeCompetitor(c)));
    }

    return res.json({
      authenticated: true,
      subscriber,
      monitoredCompetitors: competitors,
      reports: reports.filter(Boolean)
    });
  } catch (error) {
    console.error('Error in /api/me:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
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

    if (!competitors || !Array.isArray(competitors) || competitors.length === 0) {
      return res.status(400).json({ error: 'Please provide at least one competitor Facebook Page URL or Instagram profile link.' });
    }

    // 2. Validate, Clean, and Deduplicate Competitors
    const { validCompetitors, errors } = sanitizeAndDeduplicateCompetitors(competitors);

    if (validCompetitors.length === 0) {
      const errorMsg = errors.length > 0 
        ? errors[0] 
        : 'Please enter a valid Facebook Page URL (e.g. facebook.com/TheLittleGymMalaysia) or Instagram profile link.';
      return res.status(400).json({ error: errorMsg });
    }

    // Run Scraper Engine in parallel for all competitors (5 sample ads each)
    const scrapingPromises = validCompetitors.map(c => 
      scrapeCompetitor(c).catch(err => {
        console.error(`Error scraping competitor [${c}]:`, err);
        return null;
      })
    );
    const settledResults = await Promise.allSettled(scrapingPromises);
    const reports = settledResults
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);

    // Save extracted ads into DB
    for (const report of reports) {
      if (report && report.ads) {
        saveAds(report.brandName || report.query, report.ads);
      }
    }

    let subscriber = null;

    // 3. If user provided email or requested alert monitoring, validate and register
    if (email && typeof email === 'string' && email.trim().length > 0) {
      const emailValidation = validateEmail(email);
      if (!emailValidation.valid) {
        return res.status(400).json({ error: emailValidation.error });
      }

      const nameValidation = validateName(name || company || 'Subscriber');
      if (!nameValidation.valid) {
        return res.status(400).json({ error: nameValidation.error });
      }

      const validEmail = emailValidation.email;
      const validName = nameValidation.name;

      subscriber = saveSubscriber(validEmail, validName, validName, validCompetitors, userId);

      sendWelcomeAlertConfirmation(validEmail, validName, validName, validCompetitors).catch(err => {
        console.error('Resend background error:', err);
      });

      syncLeadToMailerLite({ email: validEmail, name: validName, company: validName }).catch(err => {
        console.error('MailerLite sync background error:', err);
      });
    }

    return res.json({
      success: true,
      subscriber,
      monitoredCompetitors: validCompetitors,
      reports,
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

const { startDailyMonitoringCron, runWeeklyDigestScan, runMonitoringScan } = require('./cron');

// Manual/Webhook triggers for cron operations
app.post('/api/cron/weekly-digest', async (req, res) => {
  try {
    const result = await runWeeklyDigestScan();
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/cron/daily-monitor', async (req, res) => {
  try {
    await runMonitoringScan();
    return res.json({ success: true, message: 'Daily monitoring scan completed.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Marvelop AdSpy server running on port ${PORT}`);
  startDailyMonitoringCron();
});

