const https = require('https');

async function sendEmailViaResend({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[Resend Simulated Email] To: ${to} | Subject: ${subject}`);
    return { success: true, simulated: true };
  }

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      from: 'Marvelop AdSpy <alerts@marvelop.com>',
      to: [to],
      subject,
      html
    });

    const options = {
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 8000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, data: response });
          } else {
            console.error('[Resend Error]', response);
            resolve({ success: false, error: response });
          }
        } catch (e) {
          resolve({ success: false, error: e.message });
        }
      });
    });

    req.on('error', (err) => {
      console.error('[Resend Request Error]', err.message);
      resolve({ success: false, error: err.message });
    });

    req.write(postData);
    req.end();
  });
}

async function sendWelcomeAlertConfirmation(email, name, company, competitors = []) {
  const competitorList = competitors.map(c => `<li><strong>${c}</strong></li>`).join('');
  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;">
      <h2 style="color: #0f766e; margin-top: 0;">Competitor Ad Monitoring Activated ⚡</h2>
      <p>Hi ${name || 'there'},</p>
      <p>Your Meta Ads Competitor Intelligence alert system is now active. We have initiated monitoring for <strong>${company || 'your business'}</strong> for the following competitors:</p>
      
      <ul style="background: #f7f6f2; padding: 16px 24px; border-radius: 8px;">
        ${competitorList}
      </ul>

      <p><strong>What happens next?</strong></p>
      <p>Our background scanner checks the Meta Ad Library daily. Whenever any of these competitors launch a new ad campaign, we will send a detailed breakdown directly to your inbox so you stay ahead of their strategy.</p>
      
      <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280;">
        <p>Need a done-for-you Meta Ads strategy to out-perform your competitors? <a href="https://marvelop.com/#contact" style="color: #0f766e; text-decoration: underline;">Request a Free Meta Ads Review with Marvelop</a>.</p>
      </div>
    </div>
  `;

  return sendEmailViaResend({
    to: email,
    subject: `⚡ Monitoring Active: We're tracking ${competitors.length} competitors for ${company || 'you'}`,
    html
  });
}

async function sendCompetitorNewAdAlert(email, competitorName, newAdCount = 1) {
  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;">
      <h2 style="color: #b45309; margin-top: 0;">🚨 Competitor Alert: ${competitorName} launched ${newAdCount} new ad(s)!</h2>
      <p>We just detected new active Facebook & Instagram ad creatives launched by <strong>${competitorName}</strong>.</p>
      
      <p>Log into your dashboard or check the Meta Ad Library to inspect their new creative hooks and offer angles.</p>
      
      <div style="margin-top: 24px;">
        <a href="https://marvelop.com" style="background: #0f766e; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">View Competitor Intelligence Dashboard</a>
      </div>
    </div>
  `;

  return sendEmailViaResend({
    to: email,
    subject: `🚨 Competitor Alert: ${competitorName} launched ${newAdCount} new ad(s)`,
    html
  });
}

async function sendWeeklyCompetitorDigest({ to, name, company, competitorReports = [] }) {
  const competitorsHtml = competitorReports.map((report) => {
    const brandName = report.brandName || report.query || 'Competitor Brand';
    const activeAdsCount = report.metrics?.activeAdsCount || report.ads?.length || 0;
    const videoPercent = report.metrics?.videoPercent || '50%';
    const hooks = (report.topHooks || []).slice(0, 2).map(h => `<li style="margin-bottom: 4px; color: #475569;">${h}</li>`).join('');

    const featuredAdsHtml = (report.ads || []).slice(0, 2).map((ad) => {
      const isVideo = ad.format === 'video';
      const isCarousel = ad.format === 'carousel';
      const formatLabel = isVideo ? '▶ Video' : (isCarousel ? '🎠 Carousel' : '📸 Image');
      const badgeBg = isVideo ? '#0891b2' : (isCarousel ? '#9333ea' : '#475569');
      const directUrl = ad.adLibraryUrl || `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q=${encodeURIComponent(brandName)}`;

      return `
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-top: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="background: ${badgeBg}; color: #ffffff; font-size: 11px; font-weight: bold; padding: 3px 8px; border-radius: 4px; text-transform: uppercase;">${formatLabel}</span>
            <span style="font-size: 12px; color: #64748b;">First seen: ${ad.startDate || 'Recently'}</span>
          </div>
          <p style="margin: 0 0 10px; font-size: 13px; color: #1e293b; line-height: 1.5; font-style: italic;">"${(ad.copy || '').substring(0, 180)}${ad.copy && ad.copy.length > 180 ? '...' : ''}"</p>
          <div style="text-align: right;">
            <a href="${directUrl}" target="_blank" style="color: #0891b2; font-size: 12px; font-weight: 600; text-decoration: none;">View Live on Meta Ad Library →</a>
          </div>
        </div>
      `;
    }).join('');

    const directLibUrl = report.pageId 
      ? `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=${report.pageId}`
      : `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=MY&q=${encodeURIComponent(brandName)}`;

    return `
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 12px;">
          <h3 style="margin: 0; color: #0f172a; font-size: 18px;">${brandName}</h3>
          <span style="font-size: 13px; color: #0891b2; font-weight: bold;">${activeAdsCount} Active Ads (${videoPercent} Video)</span>
        </div>

        ${hooks ? `
          <div style="margin-bottom: 12px;">
            <strong style="font-size: 12px; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">Top Copy Hooks Detected:</strong>
            <ul style="margin: 6px 0 0; padding-left: 20px; font-size: 13px;">
              ${hooks}
            </ul>
          </div>
        ` : ''}

        ${featuredAdsHtml ? `
          <div>
            <strong style="font-size: 12px; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">Featured Ad Creatives:</strong>
            ${featuredAdsHtml}
          </div>
        ` : `<p style="color: #64748b; font-size: 13px; margin: 8px 0 0;">0 active campaigns running in Meta Ad Library today.</p>`}

        <div style="margin-top: 14px; text-align: center;">
          <a href="${directLibUrl}" target="_blank" style="display: inline-block; background: #0f172a; color: #ffffff; padding: 8px 16px; border-radius: 6px; font-size: 12px; font-weight: 600; text-decoration: none;">Open ${brandName} Meta Ad Library ↗</a>
        </div>
      </div>
    `;
  }).join('');

  const totalAdsAnalyzed = competitorReports.reduce((acc, r) => acc + (r.metrics?.activeAdsCount || r.ads?.length || 0), 0);
  const brandNames = competitorReports.map(r => r.brandName || r.query).slice(0, 2).join(' & ');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 20px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
          
          <!-- HEADER -->
          <div style="background: #0b0f19; padding: 28px 24px; text-align: center; border-bottom: 2px solid #06b6d4;">
            <h1 style="color: #ffffff; font-size: 20px; margin: 0 0 6px; letter-spacing: -0.5px;">⚡ Marvelop AdSpy — Weekly Radar</h1>
            <p style="color: #94a3b8; font-size: 14px; margin: 0;">Weekly Competitor Intelligence Digest for <strong>${company || name || 'Your Brand'}</strong></p>
          </div>

          <!-- SUMMARY METRICS BAR -->
          <div style="background: #0f172a; color: #ffffff; padding: 14px 24px; display: flex; justify-content: space-around; text-align: center; font-size: 13px; border-bottom: 1px solid #1e293b;">
            <div><strong style="color: #38bdf8; font-size: 16px;">${competitorReports.length}</strong><br><span style="color: #94a3b8;">Competitors</span></div>
            <div><strong style="color: #10b981; font-size: 16px;">${totalAdsAnalyzed}</strong><br><span style="color: #94a3b8;">Active Ads Analyzed</span></div>
            <div><strong style="color: #f59e0b; font-size: 16px;">Malaysia</strong><br><span style="color: #94a3b8;">Primary Market</span></div>
          </div>

          <!-- MAIN CONTENT BODY -->
          <div style="padding: 24px;">
            <p style="font-size: 15px; color: #334155; line-height: 1.6; margin-top: 0;">
              Hi ${name || 'there'},<br>
              Here is your automated weekly breakdown of the active Meta ads, creative formats, and copy angles your competitors are scaling this week:
            </p>

            <!-- COMPETITORS DIGEST LIST -->
            ${competitorsHtml}

            <!-- STRATEGY & AGENCY REVIEW CALLOUT -->
            <div style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); border-radius: 10px; padding: 24px; color: #ffffff; text-align: center; margin-top: 28px;">
              <span style="color: #38bdf8; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">From Baseline to Market Leader</span>
              <h3 style="color: #ffffff; font-size: 18px; margin: 8px 0 10px;">Want to Out-Convert These Competitors?</h3>
              <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 18px; max-width: 480px; margin-left: auto; margin-right: auto;">
                Tracking competitors gives you the baseline. Beating them requires high-converting creative testing, audience segmentation, and lead qualification funnels.
              </p>
              <a href="https://calendly.com/contact-amriahmad/30min" target="_blank" style="background: #06b6d4; color: #ffffff; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: bold; text-decoration: none; display: inline-block;">
                Book a Free 30-Min Strategy Review →
              </a>
            </div>
          </div>

          <!-- FOOTER -->
          <div style="background: #f8fafc; padding: 18px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0 0 6px;">© 2026 Compact Ventures Sdn Bhd • Marvelop AdSpy</p>
            <p style="margin: 0;">A-1-13A, Plaza Damas 3, Sri Hartamas, 50480 Kuala Lumpur, Malaysia</p>
            <p style="margin: 8px 0 0;"><a href="https://marvelop.com" style="color: #0891b2; text-decoration: none;">View Web Dashboard</a> • <a href="https://marvelop.com/privacy.html" style="color: #0891b2; text-decoration: none;">Privacy Policy</a></p>
          </div>

        </div>
      </body>
    </html>
  `;

  return sendEmailViaResend({
    to,
    subject: `📊 Your Weekly Meta Ads Radar: ${brandNames || 'Competitor'} Updates`,
    html
  });
}

module.exports = {
  sendWelcomeAlertConfirmation,
  sendCompetitorNewAdAlert,
  sendWeeklyCompetitorDigest
};
