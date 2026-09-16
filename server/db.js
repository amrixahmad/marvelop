const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

// Support persistent volume on Railway (/data) or local directory
const dataDir = process.env.DATA_DIR || path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'marvelop_adspy.sqlite');
const db = new DatabaseSync(dbPath);

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clerk_user_id TEXT UNIQUE,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    company TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS monitored_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscriber_id INTEGER,
    competitor_url TEXT NOT NULL,
    page_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(subscriber_id) REFERENCES subscribers(id)
  );

  CREATE TABLE IF NOT EXISTS competitor_ads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_name TEXT NOT NULL,
    ad_id TEXT UNIQUE NOT NULL,
    copy TEXT,
    media_url TEXT,
    format TEXT,
    cta_text TEXT,
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1
  );
`);

function saveSubscriber(email, name, company, competitorUrls = [], clerkUserId = null) {
  let subscriber;
  try {
    const insertStmt = db.prepare(`
      INSERT INTO subscribers (email, name, company, clerk_user_id)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET 
        name=excluded.name, 
        company=excluded.company,
        clerk_user_id=COALESCE(excluded.clerk_user_id, subscribers.clerk_user_id)
      RETURNING id, email, name, company, clerk_user_id
    `);
    subscriber = insertStmt.get(email, name || '', company || '', clerkUserId || null);
  } catch (err) {
    const getStmt = db.prepare(`SELECT * FROM subscribers WHERE email = ? OR clerk_user_id = ?`);
    subscriber = getStmt.get(email, clerkUserId || email);
  }

  if (subscriber && Array.isArray(competitorUrls)) {
    const insertPage = db.prepare(`
      INSERT INTO monitored_pages (subscriber_id, competitor_url, page_name)
      VALUES (?, ?, ?)
    `);
    for (const url of competitorUrls) {
      if (!url || !url.trim()) continue;
      const cleanUrl = url.trim();
      const pageName = cleanUrl.replace(/https?:\/\/(www\.)?facebook\.com\//i, '').replace(/\/$/, '') || cleanUrl;
      try {
        insertPage.run(subscriber.id, cleanUrl, pageName);
      } catch (e) {
        // ignore duplicates
      }
    }
  }

  return subscriber;
}

function getSubscriberByClerkIdOrEmail(clerkUserId, email) {
  if (clerkUserId) {
    const stmt = db.prepare(`SELECT * FROM subscribers WHERE clerk_user_id = ?`);
    const sub = stmt.get(clerkUserId);
    if (sub) return sub;
  }
  if (email) {
    const stmt = db.prepare(`SELECT * FROM subscribers WHERE email = ?`);
    return stmt.get(email);
  }
  return null;
}

function saveAds(pageName, ads = []) {
  const insertAd = db.prepare(`
    INSERT INTO competitor_ads (page_name, ad_id, copy, media_url, format, cta_text)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(ad_id) DO UPDATE SET is_active=1
  `);

  const newAds = [];
  for (const ad of ads) {
    try {
      insertAd.run(
        pageName,
        ad.id || `ad_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        ad.copy || '',
        ad.mediaUrl || '',
        ad.format || 'image',
        ad.ctaText || 'Learn More'
      );
      newAds.push(ad);
    } catch (e) {
      // existing ad
    }
  }
  return newAds;
}

function getAllSubscribers() {
  const stmt = db.prepare(`SELECT * FROM subscribers`);
  return stmt.all();
}

function getMonitoredPagesForSubscriber(subscriberId) {
  const stmt = db.prepare(`SELECT * FROM monitored_pages WHERE subscriber_id = ?`);
  return stmt.all(subscriberId);
}

module.exports = {
  db,
  saveSubscriber,
  getSubscriberByClerkIdOrEmail,
  saveAds,
  getAllSubscribers,
  getMonitoredPagesForSubscriber
};
