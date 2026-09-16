const https = require('https');

async function syncLeadToMailerLite({ email, name, company }) {
  const apiKey = process.env.MAILERLITE_API_KEY;
  if (!apiKey) {
    console.log(`[MailerLite Sync Simulated] Email: ${email} | Name: ${name} | Company: ${company}`);
    return { success: true, simulated: true };
  }

  return new Promise((resolve) => {
    const postData = JSON.stringify({
      email,
      fields: {
        name: name || '',
        company: company || ''
      },
      status: 'active'
    });

    const options = {
      hostname: 'connect.mailerlite.com',
      path: '/api/subscribers',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
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
            console.error('[MailerLite Error]', response);
            resolve({ success: false, error: response });
          }
        } catch (e) {
          resolve({ success: false, error: e.message });
        }
      });
    });

    req.on('error', (err) => {
      console.error('[MailerLite Request Error]', err.message);
      resolve({ success: false, error: err.message });
    });

    req.write(postData);
    req.end();
  });
}

module.exports = {
  syncLeadToMailerLite
};
