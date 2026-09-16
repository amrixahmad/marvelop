const express = require('express');
const cors = require('cors');
const path = require('path');
const { saveSubscriber, saveAds } = require('./db');
const { scrapeCompetitor } = require('./scraper');
const { sendWelcomeAlertConfirmation } = require('./resend');
const { syncLeadToMailerLite } = require('./mailerlite');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets
app.use(express.static(path.join(__dirname, '..')));

// Health Check for Railway
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Main Analysis & Monitoring Signup API Endpoint
app.post('/api/analyze', async (req, res) => {
  try {
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

    // Save subscriber & competitor URLs to SQLite database
    const subscriber = saveSubscriber(email, name, company, cleanCompetitors);

    // Run Scraper Engine in parallel for all 3 competitors
    const scrapingPromises = cleanCompetitors.map(c => scrapeCompetitor(c));
    const results = await Promise.all(scrapingPromises);

    // Filter valid result objects
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
