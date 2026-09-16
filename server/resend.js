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
    subject: `🚨 Alert: ${competitorName} just launched ${newAdCount} new Meta ads!`,
    html
  });
}

module.exports = {
  sendWelcomeAlertConfirmation,
  sendCompetitorNewAdAlert
};
