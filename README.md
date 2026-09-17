# Marvelop AdSpy | Meta Ads Competitor Intelligence & Threat Radar

**Marvelop AdSpy** is a modern, high-converting **Meta Ads Competitor Intelligence Tool** built for business owners, agency owners, and growth marketers running Facebook & Instagram ads in Malaysia and worldwide.

---

## ⚡ Key Features

- 🔍 **Zero-Friction Competitor Search**: Users can search up to 3 competitor Facebook Pages instantly without entering an email or creating an account.
- 📸 **Visual Ad Creative Previews**: Renders 5 active sample ad creatives per competitor complete with image/video thumbnail previews, format badges (`VIDEO`, `IMAGE`, `CAROUSEL`), copy snippets, and start dates.
- 🔗 **Direct Meta Ad Library Links**: Every ad card and competitor report contains direct links to inspect the live campaign on Meta's public Ad Library.
- 🎯 **Competitor Threat Radar (Dark Mode)**: Features a high-stakes Bloomberg-style threat command center UI (`Threat Score: 0–100`, `🔥 45+ DAYS SCALED WINNER` badges, and video/image ratio breakdown).
- 🔑 **Clerk Authentication**: Powered by Clerk (`@clerk/express` + Clerk JS SDK) supporting 1-click Google OAuth, passwordless login, and user profile management.
- 🔔 **Automated Email Alerts (Resend)**: Users can opt-in to receive daily email notifications whenever their competitors launch new ad campaigns.
- 📬 **MailerLite Lead Sync**: Automatically syncs newly registered leads to your MailerLite account for marketing nurture.
- 🗄️ **Embedded SQLite Storage**: Built using Node's native `node:sqlite` module for persistent data storage without external database server overhead. Fully supports Railway persistent volumes (`/data`).

---

## 📁 Repository Structure

```
marvelop/
├── server/
│   ├── index.js          # Express server, API endpoints (/api/analyze, /api/me, /api/health)
│   ├── db.js             # SQLite database schemas (subscribers, monitored_pages, competitor_ads)
│   ├── scraper.js        # 3-Tier Meta Ad Library scraper & creative intelligence synthesizer
│   ├── resend.js         # Resend transactional email notification module
│   └── mailerlite.js     # MailerLite lead list integration module
├── index.html            # Main Dark Mode Threat Radar dashboard HTML & Clerk SDK
├── styles.css            # Dark mode design system, radar pulse animations, card grids, & media previews
├── main.js               # Frontend interactive logic, Clerk auth handlers, & DOM rendering
├── package.json          # Node.js dependencies & npm start scripts
└── .env                  # Local environment configuration (ignored in git)
```

---

## 🔑 Environment Variables Reference

When deploying to **Railway** or running locally, set the following environment variables:

| Variable | Description |
| :--- | :--- |
| `CLERK_PUBLISHABLE_KEY` | Your Clerk Publishable Key (`pk_test_...` or `pk_live_...`) |
| `CLERK_SECRET_KEY` | Your Clerk Secret Key (`sk_test_...` or `sk_live_...`) |
| `RESEND_API_KEY` | *(Optional)* Resend API key for sending competitor ad alert emails |
| `MAILERLITE_API_KEY` | *(Optional)* MailerLite API key for syncing new leads |
| `APIFY_API_TOKEN` | *(Optional)* Apify API token for Tier 2 scraper fallback |
| `DATA_DIR` | Directory path for SQLite storage (defaults to `/data` on Railway) |

---

## 🚀 Local Development

1. **Clone & Install Dependencies**:
   ```bash
   git clone https://github.com/amrixahmad/marvelop.git
   cd marvelop
   npm install
   ```

2. **Set Environment Variables**:
   Create a `.env` file in the project root:
   ```env
   CLERK_PUBLISHABLE_KEY=pk_test_dG91Y2hpbmctaG9yc2UtMzI5MS5jbGVyay5hY2NvdW50cy5kZXYk
   CLERK_SECRET_KEY=sk_test_DipZOEnh0g2592EqpqbxqunsLTELeWoLZdXaBD22o1
   ```

3. **Start Server**:
   ```bash
   npm start
   # Server will run at http://localhost:3000
   ```

---

## 📦 Deploying to Railway

1. Connect your GitHub repository (`amrixahmad/marvelop`) to **Railway**.
2. Railway will auto-detect `package.json` and deploy the Express server.
3. Under your Railway project's **Variables** tab, add `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` (plus optional `RESEND_API_KEY` / `MAILERLITE_API_KEY`).
4. *(Optional)* Attach a **Volume** mounted at `/data` in Railway to persist the SQLite database across restarts.

---

© Marvelop / Compact Ventures Sdn Bhd. All rights reserved.
