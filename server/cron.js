const { getAllSubscribers, getMonitoredPagesForSubscriber, saveAds } = require('./db');
const { scrapeCompetitor } = require('./scraper');
const { sendCompetitorNewAdAlert, sendWeeklyCompetitorDigest } = require('./resend');

/**
 * Background routine: Scan monitored competitor pages for new ads (Daily)
 */
async function runMonitoringScan() {
  console.log('🔍 [Daily Monitor] Starting background competitor ad scan...');
  try {
    const subscribers = getAllSubscribers();
    if (!subscribers || subscribers.length === 0) {
      console.log('ℹ️ [Daily Monitor] No active subscribers to monitor.');
      return;
    }

    for (const sub of subscribers) {
      const pages = getMonitoredPagesForSubscriber(sub.id);
      if (!pages || pages.length === 0) continue;

      for (const page of pages) {
        try {
          const pageUrl = page.competitor_url || page.page_name;
          const result = await scrapeCompetitor(pageUrl);
          if (!result || !result.ads || result.ads.length === 0) continue;

          const newAds = saveAds(result.brandName || page.page_name, result.ads);
          if (newAds && newAds.length > 0 && sub.email) {
            console.log(`🚨 [Daily Monitor] Found ${newAds.length} new ads for ${page.page_name}! Alerting ${sub.email}...`);
            await sendCompetitorNewAdAlert(sub.email, result.brandName || page.page_name, newAds.length);
          }
        } catch (pageErr) {
          console.error(`[Daily Monitor] Error checking page ${page.page_name}:`, pageErr.message);
        }
      }
    }
    console.log('✓ [Daily Monitor] Daily competitor monitoring scan completed.');
  } catch (err) {
    console.error('❌ [Daily Monitor Error]:', err);
  }
}

/**
 * Weekly routine: Dispatch personalized Meta Ads Competitor Intelligence Digest to each subscriber
 */
async function runWeeklyDigestScan() {
  console.log('📊 [Weekly Digest] Starting weekly competitor intelligence dispatch...');
  const results = [];
  try {
    const subscribers = getAllSubscribers();
    if (!subscribers || subscribers.length === 0) {
      console.log('ℹ️ [Weekly Digest] No active subscribers found.');
      return { success: true, count: 0 };
    }

    for (const sub of subscribers) {
      if (!sub.email || !sub.email.includes('@')) continue;

      const pages = getMonitoredPagesForSubscriber(sub.id);
      if (!pages || pages.length === 0) continue;

      const competitorReports = [];
      for (const page of pages) {
        try {
          const pageUrl = page.competitor_url || page.page_name;
          const report = await scrapeCompetitor(pageUrl);
          if (report) {
            competitorReports.push(report);
          }
        } catch (scrapeErr) {
          console.error(`[Weekly Digest] Error scraping ${page.page_name}:`, scrapeErr.message);
        }
      }

      if (competitorReports.length > 0) {
        console.log(`📧 [Weekly Digest] Sending weekly digest for ${competitorReports.length} brands to ${sub.email}...`);
        const emailRes = await sendWeeklyCompetitorDigest({
          to: sub.email,
          name: sub.name,
          company: sub.company,
          competitorReports
        });
        results.push({ email: sub.email, success: emailRes.success });
      }
    }

    console.log(`✓ [Weekly Digest] Weekly dispatch finished for ${results.length} subscribers.`);
    return { success: true, count: results.length, details: results };
  } catch (err) {
    console.error('❌ [Weekly Digest Error]:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Initialize background schedulers (Daily ad check + Weekly digest)
 */
function startDailyMonitoringCron() {
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const ONE_HOUR = 60 * 60 * 1000;

  // Schedule daily ad discovery scanner
  setTimeout(() => {
    runMonitoringScan();
    setInterval(runMonitoringScan, TWENTY_FOUR_HOURS);
  }, ONE_HOUR);

  // Schedule weekly digest dispatcher (every 7 days)
  setTimeout(() => {
    runWeeklyDigestScan();
    setInterval(runWeeklyDigestScan, SEVEN_DAYS);
  }, TWENTY_FOUR_HOURS);

  console.log('⏰ [Cron Schedulers] Initialized daily ad scanner & weekly digest dispatcher.');
}

module.exports = {
  runMonitoringScan,
  runWeeklyDigestScan,
  startDailyMonitoringCron
};
