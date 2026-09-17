/**
 * Form Input Sanitation & Validation Module
 * Marvelop AdSpy
 */

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com', '10minutemail.com', 'temp-mail.org', 'tempmail.com',
  'guerrillamail.com', 'sharklasers.com', 'grr.la', 'yopmail.com',
  'trashmail.com', 'dispostable.com', 'getairmail.com', 'mohmal.com',
  'fakeinbox.com', 'throwawaymail.com', 'burnermail.io', 'mailnesia.com',
  'generator.email', 'tempmailo.com', 'emailondeck.com', 'inboxkitten.com'
]);

const UNACCEPTABLE_DOMAINS = [
  'tiktok.com', 'youtube.com', 'youtu.be', 'twitter.com', 'x.com',
  'linkedin.com', 'pinterest.com', 'reddit.com', 'snapchat.com',
  'shopee.com', 'shopee.com.my', 'lazada.com', 'lazada.com.my',
  'google.com', 'amazon.com', 'ebay.com', 'myshopify.com', 'shopify.com'
];

/**
 * Validate and clean Facebook / Instagram competitor input
 * Only accepts FB page URLs, IG profile URLs, handles, or brand names.
 */
function validateAndCleanCompetitor(input) {
  if (!input || typeof input !== 'string') {
    return { valid: false, error: 'Input must be a valid text string.' };
  }

  let cleaned = input.replace(/[\r\n\t]+/g, ' ').trim();

  // Check for garbage / stack traces / code
  if (cleaned.length > 150 || /(?:node:internal|SyntaxError|\[err\]|\[inf\]|npm warn|at Object\.|Error:)/i.test(cleaned)) {
    return { valid: false, error: 'Invalid input format. Please provide a Facebook Page URL or Instagram profile.' };
  }

  // Check for unacceptable other social media / e-commerce platforms
  const lower = cleaned.toLowerCase();
  for (const domain of UNACCEPTABLE_DOMAINS) {
    if (lower.includes(domain)) {
      return { 
        valid: false, 
        error: `Only Facebook Page or Instagram profile links are supported (found unsupported domain: ${domain}).` 
      };
    }
  }

  // Handle direct numeric profile: profile.php?id=123456
  const profileIdMatch = cleaned.match(/profile\.php\?id=(\d{6,})/i);
  if (profileIdMatch) {
    return {
      valid: true,
      handle: profileIdMatch[1],
      cleanUrl: `https://www.facebook.com/profile.php?id=${profileIdMatch[1]}`,
      normalizedKey: `fb_id_${profileIdMatch[1]}`
    };
  }

  // Handle /pages/Brand-Name/123456789/
  const pagesIdMatch = cleaned.match(/pages\/[^\/]+\/(\d{6,})/i);
  if (pagesIdMatch) {
    return {
      valid: true,
      handle: pagesIdMatch[1],
      cleanUrl: `https://www.facebook.com/pages/brand/${pagesIdMatch[1]}`,
      normalizedKey: `fb_id_${pagesIdMatch[1]}`
    };
  }

  // Check if it's a generic third-party website with http/https that isn't FB or IG
  if (/^https?:\/\//i.test(cleaned)) {
    if (!/https?:\/\/(www\.|m\.|web\.|touch\.|l\.)?(facebook\.com|fb\.com|fb\.watch|instagram\.com)\//i.test(cleaned)) {
      return {
        valid: false,
        error: 'Please enter a Facebook Page URL (e.g. facebook.com/brand) or Instagram profile (e.g. instagram.com/brand).'
      };
    }
  }

  // Strip protocol and domain (supports https://facebook.com/... as well as facebook.com/...)
  let handle = cleaned.replace(/^(https?:\/\/)?(www\.|m\.|web\.|touch\.|l\.)?(facebook\.com|fb\.com|instagram\.com)\/?/i, '');

  // Strip query parameters (?fbclid=..., ?mibextid=..., ?ref=...) and hashes
  handle = handle.replace(/[?#].*$/, '');

  // Strip common subpaths
  handle = handle.replace(/\/(posts|photos|videos|reels|about|reviews|community|events|groups|shop|live_videos)(\/.*)?$/i, '');

  // Strip leading '@' or slashes
  handle = handle.replace(/^[@\/]+|[\/]+$/g, '').trim();

  // If nothing remains or contains invalid characters for a handle
  if (!handle || handle.length < 2) {
    return { valid: false, error: 'Competitor name or handle is too short (min 2 characters).' };
  }

  // Reject pure punctuation / symbols
  if (!/[a-zA-Z0-9]/.test(handle)) {
    return { valid: false, error: 'Competitor name must contain alphanumeric characters.' };
  }

  const isInstagram = lower.includes('instagram.com');
  const cleanUrl = isInstagram 
    ? `https://www.instagram.com/${handle}/`
    : `https://www.facebook.com/${handle}`;

  return {
    valid: true,
    handle,
    cleanUrl,
    normalizedKey: handle.toLowerCase()
  };
}

/**
 * Deduplicate and sanitize competitor inputs array
 */
function sanitizeAndDeduplicateCompetitors(competitorsArray) {
  if (!Array.isArray(competitorsArray)) return { validCompetitors: [], errors: [] };

  const validCompetitors = [];
  const errors = [];
  const seenKeys = new Set();

  for (const raw of competitorsArray) {
    if (!raw || typeof raw !== 'string' || !raw.trim()) continue;

    const result = validateAndCleanCompetitor(raw);
    if (!result.valid) {
      errors.push(result.error);
      continue;
    }

    if (!seenKeys.has(result.normalizedKey)) {
      seenKeys.add(result.normalizedKey);
      validCompetitors.push(result.handle);
    }
  }

  return {
    validCompetitors: validCompetitors.slice(0, 3),
    errors
  };
}

/**
 * Validate email address format & disposable providers
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email address is required.' };
  }

  const cleanEmail = email.trim().toLowerCase();
  
  // Standard RFC 5322 regex
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(cleanEmail)) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }

  const domain = cleanEmail.split('@')[1];
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return { valid: false, error: 'Disposable and temporary email addresses are not supported. Please use a work or personal email.' };
  }

  return { valid: true, email: cleanEmail };
}

/**
 * Validate name or company string
 */
function validateName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Name or company is required.' };
  }

  const clean = name.replace(/[\r\n\t]+/g, ' ').trim();
  if (clean.length < 2) {
    return { valid: false, error: 'Name must be at least 2 characters.' };
  }

  if (clean.length > 80) {
    return { valid: false, error: 'Name must be 80 characters or less.' };
  }

  if (/^https?:\/\//i.test(clean) || clean.includes('.com') || clean.includes('.my')) {
    return { valid: false, error: 'Please enter a person or company name, not a website URL.' };
  }

  return { valid: true, name: clean };
}

module.exports = {
  validateAndCleanCompetitor,
  sanitizeAndDeduplicateCompetitors,
  validateEmail,
  validateName
};
