const path = require('path');
const fs = require('fs');

// Support persistent volume on Railway (/data) or local directory
const dataDir = process.env.DATA_DIR || path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function getTierLimits(tier = 'guest') {
  switch (tier) {
    case 'pro':
      return {
        tier: 'pro',
        tierName: 'Pro Plan',
        priceMYR: 'RM99/mo',
        maxCompetitors: 25,
        maxAdsPerBrand: 50,
        alertFrequency: 'daily',
        historyDays: 90,
        maxSwipeAds: 9999,
        canExport: true,
        canFilter: true,
        badge: '⚡ Pro Plan'
      };
    case 'starter':
      return {
        tier: 'starter',
        tierName: 'Starter Plan',
        priceMYR: 'RM49/mo',
        maxCompetitors: 10,
        maxAdsPerBrand: 15,
        alertFrequency: 'daily',
        historyDays: 30,
        maxSwipeAds: 25,
        canExport: false,
        canFilter: true,
        badge: '🚀 Starter Plan'
      };
    case 'free_registered':
    case 'free':
      return {
        tier: 'free',
        tierName: 'Free Registered',
        priceMYR: 'Free',
        maxCompetitors: 5,
        maxAdsPerBrand: 10,
        alertFrequency: 'weekly',
        historyDays: 14,
        maxSwipeAds: 5,
        canExport: false,
        canFilter: false,
        badge: '👤 Free Member'
      };
    case 'guest':
    default:
      return {
        tier: 'guest',
        tierName: 'Free Guest',
        priceMYR: 'Free',
        maxCompetitors: 3,
        maxAdsPerBrand: 5,
        alertFrequency: 'none',
        historyDays: 0,
        maxSwipeAds: 0,
        canExport: false,
        canFilter: false,
        badge: '🆓 Guest'
      };
  }
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
        tier TEXT DEFAULT 'free',
        subscription_status TEXT DEFAULT 'active',
        billing_cycle TEXT DEFAULT 'monthly',
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
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

      CREATE TABLE IF NOT EXISTS saved_swipe_ads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subscriber_id INTEGER,
        ad_id TEXT NOT NULL,
        brand_name TEXT NOT NULL,
        copy TEXT,
        media_url TEXT,
        format TEXT,
        tags TEXT,
        saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(subscriber_id) REFERENCES subscribers(id)
      );

      CREATE TABLE IF NOT EXISTS analysis_cache (
        query_key TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at INTEGER NOT NULL
      );
    `);

    // Safe column migrations for existing SQLite databases
    const columnsToEnsure = [
      "ALTER TABLE subscribers ADD COLUMN tier TEXT DEFAULT 'free'",
      "ALTER TABLE subscribers ADD COLUMN subscription_status TEXT DEFAULT 'active'",
      "ALTER TABLE subscribers ADD COLUMN billing_cycle TEXT DEFAULT 'monthly'",
      "ALTER TABLE subscribers ADD COLUMN stripe_customer_id TEXT",
      "ALTER TABLE subscribers ADD COLUMN stripe_subscription_id TEXT"
    ];
    for (const sql of columnsToEnsure) {
      try {
        sqliteDb.exec(sql);
      } catch (e) {
        // Column already exists
      }
    }

    console.log('📦 Database: Initialized with native node:sqlite (Tier & Dashboard enabled)');
  }
} catch (e) {
  // node:sqlite not present in Node <= 20
}

// Fallback JSON-backed persistent store
const jsonDbPath = path.join(dataDir, 'marvelop_adspy.json');
let jsonData = {
  subscribers: [],
  monitored_pages: [],
  competitor_ads: [],
  saved_swipe_ads: [],
  analysis_cache: [],
  nextSubscriberId: 1,
  nextPageId: 1,
  nextAdId: 1,
  nextSwipeId: 1
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

function saveSubscriber(email, name, company, competitorUrls = [], clerkUserId = null, tier = 'free') {
  if (sqliteDb) {
    let subscriber;
    try {
      const insertStmt = sqliteDb.prepare(`
        INSERT INTO subscribers (email, name, company, clerk_user_id, tier)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET 
          name=COALESCE(NULLIF(excluded.name, ''), subscribers.name), 
          company=COALESCE(NULLIF(excluded.company, ''), subscribers.company),
          clerk_user_id=COALESCE(excluded.clerk_user_id, subscribers.clerk_user_id)
        RETURNING id, email, name, company, clerk_user_id, tier, subscription_status
      `);
      subscriber = insertStmt.get(email, name || '', company || '', clerkUserId || null, tier || 'free');
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
    if (!sub.tier) sub.tier = tier || 'free';
  } else {
    sub = {
      id: jsonData.nextSubscriberId++,
      clerk_user_id: clerkUserId || null,
      email,
      name: name || '',
      company: company || '',
      tier: tier || 'free',
      subscription_status: 'active',
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

function updateUserTier(clerkUserId, email, tier = 'starter', subscriptionData = {}) {
  const validTiers = ['free', 'starter', 'pro'];
  if (!validTiers.includes(tier)) tier = 'starter';

  if (sqliteDb) {
    try {
      const stmt = sqliteDb.prepare(`
        UPDATE subscribers 
        SET tier = ?,
            subscription_status = ?,
            billing_cycle = COALESCE(?, billing_cycle),
            stripe_customer_id = COALESCE(?, stripe_customer_id),
            stripe_subscription_id = COALESCE(?, stripe_subscription_id)
        WHERE (clerk_user_id IS NOT NULL AND clerk_user_id = ?) OR email = ?
        RETURNING *
      `);
      return stmt.get(
        tier,
        subscriptionData.status || 'active',
        subscriptionData.billingCycle || null,
        subscriptionData.customerId || null,
        subscriptionData.subscriptionId || null,
        clerkUserId || null,
        email || null
      );
    } catch (e) {
      console.error('Error updating user tier:', e);
    }
  }

  const sub = jsonData.subscribers.find(s => (clerkUserId && s.clerk_user_id === clerkUserId) || (email && s.email === email));
  if (sub) {
    sub.tier = tier;
    sub.subscription_status = subscriptionData.status || 'active';
    if (subscriptionData.billingCycle) sub.billing_cycle = subscriptionData.billingCycle;
    persistJson();
    return sub;
  }
  return null;
}

function addMonitoredCompetitor(subscriberId, rawUrl) {
  if (!rawUrl || !rawUrl.trim()) return null;
  const cleanUrl = rawUrl.trim();
  const pageName = cleanUrl.replace(/https?:\/\/(www\.)?facebook\.com\//i, '').replace(/\/$/, '') || cleanUrl;

  if (sqliteDb) {
    try {
      const stmt = sqliteDb.prepare(`
        INSERT INTO monitored_pages (subscriber_id, competitor_url, page_name)
        VALUES (?, ?, ?)
        RETURNING *
      `);
      return stmt.get(subscriberId, cleanUrl, pageName);
    } catch (e) {
      console.error('Error adding monitored competitor:', e);
      return null;
    }
  }

  if (!jsonData.monitored_pages) jsonData.monitored_pages = [];
  const exists = jsonData.monitored_pages.some(p => p.subscriber_id === subscriberId && p.page_name === pageName);
  if (!exists) {
    const newPage = {
      id: jsonData.nextPageId++,
      subscriber_id: subscriberId,
      competitor_url: cleanUrl,
      page_name: pageName,
      created_at: new Date().toISOString()
    };
    jsonData.monitored_pages.push(newPage);
    persistJson();
    return newPage;
  }
  return null;
}

function removeMonitoredCompetitor(subscriberId, pageNameOrId) {
  if (sqliteDb) {
    try {
      const stmt = sqliteDb.prepare(`
        DELETE FROM monitored_pages 
        WHERE subscriber_id = ? AND (page_name = ? OR id = ?)
      `);
      stmt.run(subscriberId, String(pageNameOrId), Number(pageNameOrId) || 0);
      return true;
    } catch (e) {
      console.error('Error removing competitor:', e);
      return false;
    }
  }

  if (jsonData.monitored_pages) {
    jsonData.monitored_pages = jsonData.monitored_pages.filter(p => 
      !(p.subscriber_id === subscriberId && (p.page_name === pageNameOrId || p.id === Number(pageNameOrId)))
    );
    persistJson();
    return true;
  }
  return false;
}

// Swipe File Functions
function getSavedSwipeAds(subscriberId) {
  if (sqliteDb) {
    try {
      const stmt = sqliteDb.prepare(`SELECT * FROM saved_swipe_ads WHERE subscriber_id = ? ORDER BY saved_at DESC`);
      return stmt.all(subscriberId);
    } catch (e) {
      console.error('Error reading swipe file:', e);
      return [];
    }
  }
  if (!jsonData.saved_swipe_ads) jsonData.saved_swipe_ads = [];
  return jsonData.saved_swipe_ads.filter(s => s.subscriber_id === subscriberId);
}

function saveAdToSwipeFile(subscriberId, adData) {
  if (sqliteDb) {
    try {
      const stmt = sqliteDb.prepare(`
        INSERT INTO saved_swipe_ads (subscriber_id, ad_id, brand_name, copy, media_url, format, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `);
      return stmt.get(
        subscriberId,
        adData.adId || `ad_${Date.now()}`,
        adData.brandName || 'Brand',
        adData.copy || '',
        adData.mediaUrl || '',
        adData.format || 'image',
        adData.tags || 'General Hook'
      );
    } catch (e) {
      console.error('Error saving ad to swipe file:', e);
      return null;
    }
  }

  if (!jsonData.saved_swipe_ads) jsonData.saved_swipe_ads = [];
  const newSwipe = {
    id: jsonData.nextSwipeId++,
    subscriber_id: subscriberId,
    ad_id: adData.adId || `ad_${Date.now()}`,
    brand_name: adData.brandName || 'Brand',
    copy: adData.copy || '',
    media_url: adData.mediaUrl || '',
    format: adData.format || 'image',
    tags: adData.tags || 'General Hook',
    saved_at: new Date().toISOString()
  };
  jsonData.saved_swipe_ads.push(newSwipe);
  persistJson();
  return newSwipe;
}

function removeAdFromSwipeFile(subscriberId, swipeIdOrAdId) {
  if (sqliteDb) {
    try {
      const stmt = sqliteDb.prepare(`
        DELETE FROM saved_swipe_ads 
        WHERE subscriber_id = ? AND (id = ? OR ad_id = ?)
      `);
      stmt.run(subscriberId, Number(swipeIdOrAdId) || 0, String(swipeIdOrAdId));
      return true;
    } catch (e) {
      console.error('Error deleting swipe ad:', e);
      return false;
    }
  }

  if (jsonData.saved_swipe_ads) {
    jsonData.saved_swipe_ads = jsonData.saved_swipe_ads.filter(s => 
      !(s.subscriber_id === subscriberId && (s.id === Number(swipeIdOrAdId) || s.ad_id === String(swipeIdOrAdId)))
    );
    persistJson();
    return true;
  }
  return false;
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

function getCachedAnalysis(queryKey) {
  const normalizedKey = (queryKey || '').toLowerCase().trim();
  if (!normalizedKey) return null;

  const now = Date.now();

  if (sqliteDb) {
    try {
      const stmt = sqliteDb.prepare(`SELECT data_json, expires_at FROM analysis_cache WHERE query_key = ?`);
      const row = stmt.get(normalizedKey);
      if (row) {
        if (row.expires_at > now) {
          return JSON.parse(row.data_json);
        } else {
          sqliteDb.prepare(`DELETE FROM analysis_cache WHERE query_key = ?`).run(normalizedKey);
        }
      }
    } catch (e) {
      console.error('SQLite cache read error:', e);
    }
    return null;
  }

  if (!jsonData.analysis_cache) jsonData.analysis_cache = [];
  const entry = jsonData.analysis_cache.find(e => e.query_key === normalizedKey);
  if (entry) {
    if (entry.expires_at > now) {
      return entry.data;
    } else {
      jsonData.analysis_cache = jsonData.analysis_cache.filter(e => e.query_key !== normalizedKey);
      persistJson();
    }
  }
  return null;
}

function setCachedAnalysis(queryKey, data, ttlSeconds = 14400) {
  const normalizedKey = (queryKey || '').toLowerCase().trim();
  if (!normalizedKey || !data) return;

  const expiresAt = Date.now() + (ttlSeconds * 1000);

  if (sqliteDb) {
    try {
      const stmt = sqliteDb.prepare(`
        INSERT INTO analysis_cache (query_key, data_json, expires_at)
        VALUES (?, ?, ?)
        ON CONFLICT(query_key) DO UPDATE SET
          data_json = excluded.data_json,
          expires_at = excluded.expires_at
      `);
      stmt.run(normalizedKey, JSON.stringify(data), expiresAt);
    } catch (e) {
      console.error('SQLite cache write error:', e);
    }
    return;
  }

  if (!jsonData.analysis_cache) jsonData.analysis_cache = [];
  const existingIndex = jsonData.analysis_cache.findIndex(e => e.query_key === normalizedKey);
  const cacheObj = {
    query_key: normalizedKey,
    data,
    expires_at: expiresAt
  };

  if (existingIndex >= 0) {
    jsonData.analysis_cache[existingIndex] = cacheObj;
  } else {
    jsonData.analysis_cache.push(cacheObj);
  }
  persistJson();
}

function deleteCachedAnalysis(queryKey) {
  const normalizedKey = (queryKey || '').toLowerCase().trim();
  if (!normalizedKey) return;

  if (sqliteDb) {
    try {
      sqliteDb.prepare(`DELETE FROM analysis_cache WHERE query_key = ?`).run(normalizedKey);
    } catch (e) {
      console.error('SQLite cache delete error:', e);
    }
    return;
  }

  if (jsonData.analysis_cache) {
    jsonData.analysis_cache = jsonData.analysis_cache.filter(e => e.query_key !== normalizedKey);
    persistJson();
  }
}

module.exports = {
  sqliteDb,
  getTierLimits,
  saveSubscriber,
  getSubscriberByClerkIdOrEmail,
  updateUserTier,
  addMonitoredCompetitor,
  removeMonitoredCompetitor,
  getSavedSwipeAds,
  saveAdToSwipeFile,
  removeAdFromSwipeFile,
  getAllSubscribers,
  saveAds,
  getMonitoredPagesForSubscriber,
  getCachedAnalysis,
  setCachedAnalysis,
  deleteCachedAnalysis
};
