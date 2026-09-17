require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { clerkMiddleware, getAuth } = require('@clerk/express');
const { saveSubscriber, getSubscriberByClerkIdOrEmail, getMonitoredPagesForSubscriber, saveAds } = require('./db');
const { scrapeCompetitor } = require('./scraper');
const { sendWelcomeAlertConfirmation } = require('./resend');
const { syncLeadToMailerLite } = require('./mailerlite');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.post('/api/analyze', async (req, res) => {
  try {
    const auth = getAuth(req);
    const userId = auth?.userId;
    const { name, email, company, competitors, enableAlerts } = req.body;

    if (!competitors || !Array.isArray(competitors) || competitors.filter(c => c && typeof c === 'string' && c.trim()).length === 0) {
      return res.status(400).json({ error: 'Please provide at least one competitor Facebook Page URL or name.' });
    }

    const cleanCompetitors = competitors
      .filter(c => typeof c === 'string' && c.trim().length > 0)
      .map(c => c.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 100))
      .filter(c => c.length > 0 && !/(?:node:internal|SyntaxError|\[err\]|\[inf\]|npm warn|at Object\.)/i.test(c))
      .slice(0, 3);

    if (cleanCompetitors.length === 0) {
      return res.status(400).json({ error: 'Please enter a valid competitor Facebook Page URL or brand name (e.g. facebook.com/TheLittleGymMalaysia or Nike).' });
    }

    // Run Scraper Engine in parallel for all competitors (5 sample ads each)
    const scrapingPromises = cleanCompetitors.map(c => 
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

    // If user provided email or requested alert monitoring, register them in DB & send welcome email
    if (email && email.includes('@')) {
      subscriber = saveSubscriber(email, name || '', company || name || '', cleanCompetitors, userId);

      sendWelcomeAlertConfirmation(email, name, company, cleanCompetitors).catch(err => {
        console.error('Resend background error:', err);
      });

      syncLeadToMailerLite({ email, name, company }).catch(err => {
        console.error('MailerLite sync background error:', err);
      });
    }

    return res.json({
      success: true,
      subscriber,
      monitoredCompetitors: cleanCompetitors,
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

