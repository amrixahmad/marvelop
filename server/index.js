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

// Apply Clerk Auth Middleware
app.use(clerkMiddleware({
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  secretKey: process.env.CLERK_SECRET_KEY
}));

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
    const { name, email, company, competitors } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid work email is required.' });
    }

    if (!competitors || !Array.isArray(competitors) || competitors.filter(c => c && c.trim()).length === 0) {
      return res.status(400).json({ error: 'Please provide at least one competitor Facebook Page URL or name.' });
    }

    const cleanCompetitors = competitors
      .filter(c => typeof c === 'string' && c.trim().length > 0)
      .slice(0, 3);

    // Save subscriber & competitor URLs to SQLite database, linking Clerk User ID if authenticated
    const subscriber = saveSubscriber(email, name, company, cleanCompetitors, userId);

    // Run Scraper Engine in parallel for all competitors
    const scrapingPromises = cleanCompetitors.map(c => scrapeCompetitor(c));
    const results = await Promise.all(scrapingPromises);
    const reports = results.filter(Boolean);

    // Save extracted ads into DB
    for (const report of reports) {
      if (report && report.ads) {
        saveAds(report.brandName || report.query, report.ads);
      }
    }

    // Trigger async email confirmation via Resend & lead sync via MailerLite
    sendWelcomeAlertConfirmation(email, name, company, cleanCompetitors).catch(err => {
      console.error('Resend background error:', err);
    });

    syncLeadToMailerLite({ email, name, company }).catch(err => {
      console.error('MailerLite sync background error:', err);
    });

    return res.json({
      success: true,
      subscriber,
      monitoredCompetitors: cleanCompetitors,
      reports,
      summary: {
        totalCompetitors: reports.length,
        totalActiveAdsAnalyzed: reports.reduce((acc, r) => acc + (r.metrics?.activeAdsCount || 0), 0),
        primaryMarket: 'Malaysia (MY)',
        monitoringActive: true
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
