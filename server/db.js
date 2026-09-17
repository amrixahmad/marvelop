const path = require('path');
const fs = require('fs');

// Support persistent volume on Railway (/data) or local directory
const dataDir = process.env.DATA_DIR || path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let sqliteDb = null;
try {
  const { DatabaseSync } = require('node:sqlite');
  if (DatabaseSync) {
    const dbPath = path.join(dataDir, 'marvelop_adspy.sqlite');
    sqliteDb = new DatabaseSync(dbPath);

    // Initialize SQLite Tables
    sqliteDb.exec(`
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
    console.log('📦 Database: Initialized with native node:sqlite');
  }
} catch (e) {
  // node:sqlite not present in Node <= 20
}

// Fallback JSON-backed persistent store for Node environments without node:sqlite
const jsonDbPath = path.join(dataDir, 'marvelop_adspy.json');
let jsonData = {
  subscribers: [],
  monitored_pages: [],
  competitor_ads: [],
  nextSubscriberId: 1,
  nextPageId: 1,
  nextAdId: 1
};

if (!sqliteDb) {
  if (fs.existsSync(jsonDbPath)) {
    try {
      jsonData = JSON.parse(fs.readFileSync(jsonDbPath, 'utf8'));
    } catch (err) {
      console.error('Error reading JSON DB, initializing fresh:', err);
    }
  }
  console.log('📦 Database: Initialized with persistent JSON storage');
}

function persistJson() {
  if (!sqliteDb) {
    try {
      fs.writeFileSync(jsonDbPath, JSON.stringify(jsonData, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving JSON DB:', err);
    }
  }
}

function saveSubscriber(email, name, company, competitorUrls = [], clerkUserId = null) {
  if (sqliteDb) {
    let subscriber;
    try {
      const insertStmt = sqliteDb.prepare(`
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
      const getStmt = sqliteDb.prepare(`SELECT * FROM subscribers WHERE email = ? OR clerk_user_id = ?`);
      subscriber = getStmt.get(email, clerkUserId || email);
    }

    if (subscriber && Array.isArray(competitorUrls)) {
      const insertPage = sqliteDb.prepare(`
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

  // Fallback JSON Store logic
  let sub = jsonData.subscribers.find(s => s.email === email || (clerkUserId && s.clerk_user_id === clerkUserId));
  if (sub) {
    if (name) sub.name = name;
    if (company) sub.company = company;
    if (clerkUserId && !sub.clerk_user_id) sub.clerk_user_id = clerkUserId;
  } else {
    sub = {
      id: jsonData.nextSubscriberId++,
      clerk_user_id: clerkUserId || null,
      email,
      name: name || '',
      company: company || '',
      created_at: new Date().toISOString()
    };
    jsonData.subscribers.push(sub);
  }

  if (Array.isArray(competitorUrls)) {
    for (const url of competitorUrls) {
      if (!url || !url.trim()) continue;
      const cleanUrl = url.trim();
      const pageName = cleanUrl.replace(/https?:\/\/(www\.)?facebook\.com\//i, '').replace(/\/$/, '') || cleanUrl;
      const exists = jsonData.monitored_pages.some(p => p.subscriber_id === sub.id && p.page_name === pageName);
      if (!exists) {
        jsonData.monitored_pages.push({
          id: jsonData.nextPageId++,
          subscriber_id: sub.id,
          competitor_url: cleanUrl,
          page_name: pageName,
          created_at: new Date().toISOString()
        });
      }
    }
  }

  persistJson();
  return sub;
}

function getSubscriberByClerkIdOrEmail(clerkUserId, email) {
  if (sqliteDb) {
    if (clerkUserId) {
      const stmt = sqliteDb.prepare(`SELECT * FROM subscribers WHERE clerk_user_id = ?`);
      const sub = stmt.get(clerkUserId);
      if (sub) return sub;
    }
    if (email) {
      const stmt = sqliteDb.prepare(`SELECT * FROM subscribers WHERE email = ?`);
      return stmt.get(email);
    }
    return null;
  }

  if (clerkUserId) {
    const sub = jsonData.subscribers.find(s => s.clerk_user_id === clerkUserId);
    if (sub) return sub;
  }
  if (email) {
    const sub = jsonData.subscribers.find(s => s.email === email);
    if (sub) return sub;
  }
  return null;
}

function saveAds(pageName, ads = []) {
  if (sqliteDb) {
    const insertAd = sqliteDb.prepare(`
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

  const newAds = [];
  for (const ad of ads) {
    const adId = ad.id || `ad_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const existing = jsonData.competitor_ads.find(a => a.ad_id === adId);
    if (existing) {
      existing.is_active = 1;
    } else {
      const newEntry = {
        id: jsonData.nextAdId++,
        page_name: pageName,
        ad_id: adId,
        copy: ad.copy || '',
        media_url: ad.mediaUrl || '',
        format: ad.format || 'image',
        cta_text: ad.ctaText || 'Learn More',
        first_seen: new Date().toISOString(),
        is_active: 1
      };
      jsonData.competitor_ads.push(newEntry);
      newAds.push(ad);
    }
  }
  persistJson();
  return newAds;
}

function getAllSubscribers() {
  if (sqliteDb) {
    const stmt = sqliteDb.prepare(`SELECT * FROM subscribers`);
    return stmt.all();
  }
  return jsonData.subscribers;
}

function getMonitoredPagesForSubscriber(subscriberId) {
  if (sqliteDb) {
    const stmt = sqliteDb.prepare(`SELECT * FROM monitored_pages WHERE subscriber_id = ?`);
    return stmt.all(subscriberId);
  }
  return jsonData.monitored_pages.filter(p => p.subscriber_id === subscriberId);
}

module.exports = {
  db: sqliteDb,
  saveSubscriber,
  getSubscriberByClerkIdOrEmail,
  saveAds,
  getAllSubscribers,
  getMonitoredPagesForSubscriber
};
