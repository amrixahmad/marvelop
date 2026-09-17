const { getAllSubscribers, getMonitoredPagesForSubscriber, saveAds } = require('./db');
const { scrapeCompetitor } = require('./scraper');
const { sendCompetitorNewAdAlert } = require('./resend');

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

function startDailyMonitoringCron() {
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  const ONE_HOUR = 60 * 60 * 1000;

  setTimeout(() => {
    runMonitoringScan();
    setInterval(runMonitoringScan, TWENTY_FOUR_HOURS);
  }, ONE_HOUR);

  console.log('⏰ [Daily Monitor] Competitor ad tracking cron scheduled (24h interval).');
}

module.exports = {
  runMonitoringScan,
  startDailyMonitoringCron
};
