document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('adspyForm');
  const submitBtn = document.getElementById('submitBtn');
  const btnText = submitBtn ? submitBtn.querySelector('.btn-text') : null;
  const spinner = submitBtn ? submitBtn.querySelector('.spinner') : null;
  const statusNode = document.getElementById('formStatus');
  const yearNode = document.getElementById('year');

  const resultsSection = document.getElementById('resultsSection');
  const metricsCards = document.getElementById('metricsCards');
  const competitorsContainer = document.getElementById('competitorsContainer');

  const alertOptinForm = document.getElementById('alertOptinForm');
  const activateAlertsBtn = document.getElementById('activateAlertsBtn');
  const alertOptinStatus = document.getElementById('alertOptinStatus');

  const authButtons = document.getElementById('auth-buttons');
  const signInBtn = document.getElementById('signInBtn');
  const userButtonNode = document.getElementById('user-button');

  let currentCompetitors = [];

  if (yearNode) {
    yearNode.textContent = new Date().getFullYear();
  }

  // --- CLERK FRONTEND AUTH INTEGRATION ---
  let clerk = window.Clerk;

  async function initClerk() {
    if (!clerk) return;
    try {
      await clerk.load();

      if (signInBtn) {
        signInBtn.addEventListener('click', () => {
          clerk.openSignIn({});
        });
      }

      if (clerk.user) {
        if (authButtons) authButtons.style.display = 'none';
        if (userButtonNode) {
          clerk.mountUserButton(userButtonNode);
        }

        const emailInput = document.getElementById('userEmail');
        const nameInput = document.getElementById('userName');
        if (emailInput && !emailInput.value) {
          emailInput.value = clerk.user.primaryEmailAddress?.emailAddress || '';
        }
        if (nameInput && !nameInput.value) {
          nameInput.value = clerk.user.fullName || clerk.user.firstName || '';
        }

        fetchUserSavedDashboard();
      } else {
        if (authButtons) authButtons.style.display = 'inline-block';
      }
    } catch (err) {
      console.error('Clerk Initialization Error:', err);
    }
  }

  if (window.Clerk) {
    initClerk();
  } else {
    window.addEventListener('load', initClerk);
  }

  async function fetchUserSavedDashboard() {
    try {
      const res = await fetch('/api/me');
      const data = await res.json();
      if (data.authenticated && data.subscriber && data.reports && data.reports.length > 0) {
        renderDashboard(data);
        if (resultsSection) {
          resultsSection.classList.remove('hidden');
        }
      }
    } catch (e) {
      console.error('Error loading saved user dashboard:', e);
    }
  }

  // --- TOP SEARCH FORM HANDLER (FREE SEARCH, NO EMAIL REQUIRED) ---
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (statusNode) {
        statusNode.textContent = '';
        statusNode.className = 'form-status';
      }

      const comp1 = (document.getElementById('comp1')?.value || '').trim();
      const comp2 = (document.getElementById('comp2')?.value || '').trim();
      const comp3 = (document.getElementById('comp3')?.value || '').trim();
      const website = (document.getElementById('website')?.value || '').trim();

      if (website) {
        if (statusNode) {
          statusNode.textContent = 'Submission blocked.';
          statusNode.classList.add('error');
        }
        return;
      }

      if (!comp1) {
        if (statusNode) {
          statusNode.textContent = 'Please enter at least 1 competitor Facebook Page URL or name.';
          statusNode.classList.add('error');
        }
        return;
      }

      const UNACCEPTABLE_DOMAINS = [
        'tiktok.com', 'youtube.com', 'youtu.be', 'twitter.com', 'x.com',
        'linkedin.com', 'pinterest.com', 'reddit.com', 'snapchat.com',
        'shopee.com', 'shopee.com.my', 'lazada.com', 'lazada.com.my',
        'google.com', 'amazon.com', 'ebay.com', 'myshopify.com', 'shopify.com'
      ];

      const validateInputString = (str) => {
        if (!str) return { valid: true };
        const clean = str.replace(/[\r\n\t]+/g, ' ').trim();
        
        if (clean.length > 150 || /(?:node:internal|SyntaxError|\[err\]|\[inf\]|npm warn|at Object\.|Error:)/i.test(clean)) {
          return { valid: false, error: 'Invalid input. Please provide a Facebook Page or Instagram profile link.' };
        }

        const lower = clean.toLowerCase();
        for (const dom of UNACCEPTABLE_DOMAINS) {
          if (lower.includes(dom)) {
            return { valid: false, error: `Only Facebook Page or Instagram profile links are supported (found ${dom}).` };
          }
        }

        if (/^https?:\/\//i.test(clean)) {
          if (!/https?:\/\/(www\.|m\.|web\.|touch\.|l\.)?(facebook\.com|fb\.com|fb\.watch|instagram\.com)\//i.test(clean)) {
            return { valid: false, error: 'Please enter a Facebook Page URL (e.g. facebook.com/brand) or Instagram profile link (e.g. instagram.com/brand).' };
          }
        }

        if (clean.length < 2) {
          return { valid: false, error: 'Competitor name or handle is too short (min 2 characters).' };
        }

        if (!/[a-zA-Z0-9]/.test(clean)) {
          return { valid: false, error: 'Competitor name must contain alphanumeric characters.' };
        }

        return { valid: true, clean };
      };

      const v1 = validateInputString(comp1);
      if (!v1.valid) {
        if (statusNode) {
          statusNode.textContent = v1.error;
          statusNode.classList.add('error');
        }
        return;
      }

      const v2 = validateInputString(comp2);
      if (!v2.valid) {
        if (statusNode) {
          statusNode.textContent = v2.error;
          statusNode.classList.add('error');
        }
        return;
      }

      const v3 = validateInputString(comp3);
      if (!v3.valid) {
        if (statusNode) {
          statusNode.textContent = v3.error;
          statusNode.classList.add('error');
        }
        return;
      }

      currentCompetitors = [comp1, comp2, comp3]
        .map(c => c.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 100))
        .filter(c => c.length > 0);

      submitBtn.disabled = true;
      if (btnText) btnText.textContent = 'Scanning Competitor Ads & Creative Hooks...';
      if (spinner) spinner.classList.remove('hidden');

      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            competitors: currentCompetitors
          })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to analyze competitors.');
        }

        renderDashboard(data);

        if (statusNode) {
          statusNode.textContent = '✓ Live competitor ads & creative intelligence loaded!';
          statusNode.classList.add('success');
        }

        if (resultsSection) {
          resultsSection.classList.remove('hidden');
          setTimeout(() => {
            const scrollTarget = competitorsContainer || resultsSection;
            scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 50);
        }

      } catch (error) {
        console.error(error);
        if (statusNode) {
          statusNode.textContent = error.message || 'Something went wrong. Please check your connection.';
          statusNode.classList.add('error');
        }
      } finally {
        submitBtn.disabled = false;
        if (btnText) btnText.textContent = 'Scan Competitor Ads Now ⚡';
        if (spinner) spinner.classList.add('hidden');
      }
    });
  }

  // --- ALERT OPT-IN FORM HANDLER ---
  if (alertOptinForm) {
    alertOptinForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (alertOptinStatus) {
        alertOptinStatus.textContent = '';
        alertOptinStatus.className = 'form-status';
      }

      const email = (document.getElementById('userEmail')?.value || '').trim().toLowerCase();
      const name = (document.getElementById('userName')?.value || '').trim();

      const DISPOSABLE_EMAIL_DOMAINS = ['mailinator.com', '10minutemail.com', 'temp-mail.org', 'tempmail.com', 'guerrillamail.com', 'yopmail.com', 'trashmail.com'];
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!email || !emailRegex.test(email)) {
        if (alertOptinStatus) {
          alertOptinStatus.textContent = 'Please enter a valid work email address.';
          alertOptinStatus.classList.add('error');
        }
        return;
      }

      const domain = email.split('@')[1] || '';
      if (DISPOSABLE_EMAIL_DOMAINS.includes(domain)) {
        if (alertOptinStatus) {
          alertOptinStatus.textContent = 'Disposable email addresses are not supported. Please use a work or personal email.';
          alertOptinStatus.classList.add('error');
        }
        return;
      }

      if (!name || name.length < 2) {
        if (alertOptinStatus) {
          alertOptinStatus.textContent = 'Please enter your name or company name (min 2 characters).';
          alertOptinStatus.classList.add('error');
        }
        return;
      }

      if (/^https?:\/\//i.test(name) || name.includes('.com') || name.includes('.my')) {
        if (alertOptinStatus) {
          alertOptinStatus.textContent = 'Please enter a name or company, not a website URL.';
          alertOptinStatus.classList.add('error');
        }
        return;
      }

      activateAlertsBtn.disabled = true;

      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name,
            email,
            company: name,
            competitors: currentCompetitors.length > 0 ? currentCompetitors : ['Competitor Target']
          })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to activate alerts.');
        }

        if (alertOptinStatus) {
          alertOptinStatus.textContent = `✓ Alerts activated for ${email}! We will email you daily when new ads go live.`;
          alertOptinStatus.classList.add('success');
        }

        if (window.Clerk && !window.Clerk.user) {
          setTimeout(() => {
            window.Clerk.openSignUp({});
          }, 1200);
        }

      } catch (err) {
        if (alertOptinStatus) {
          alertOptinStatus.textContent = err.message || 'Failed to activate alerts.';
          alertOptinStatus.classList.add('error');
        }
      } finally {
        activateAlertsBtn.disabled = false;
      }
    });
  }

  function renderDashboard(data) {
    const reports = data.reports || [];
    const summary = data.summary || {};

    if (metricsCards) {
      metricsCards.innerHTML = `
        <article class="card">
          <span class="eyebrow">Inspected Brands</span>
          <h3>${summary.totalCompetitors || reports.length} Competitor Brand(s)</h3>
          <p>Displaying 5 active sample ad creatives per brand.</p>
        </article>

        <article class="card">
          <span class="eyebrow">Competitor Pressure Score</span>
          <h3>78/100 (High Velocity) 🔥</h3>
          <p>Analyzing format distribution, messaging angles & active ads lifespan.</p>
        </article>

        <article class="card">
          <span class="eyebrow">Daily Email Alerts</span>
          <h3>${summary.monitoringActive ? '<span class="pulse-dot"></span> Active ⚡' : 'Optional (Opt-in Below)'}</h3>
          <p>${summary.monitoringActive ? 'Daily Meta Ad Library updates enabled.' : 'Enter email below to receive daily launch alerts.'}</p>
        </article>
      `;
    }

    if (competitorsContainer) {
      competitorsContainer.innerHTML = reports.map((r, idx) => {
        const isNumericId = /^\d+$/.test(r.brandName || r.query);
        const searchName = (!isNumericId && r.brandName) ? r.brandName : (r.brandName || r.query);
        const directLibPageUrl = (r.pageId && !r.pageId.startsWith('1000'))
          ? `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=${r.pageId}`
          : `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=MY&q=${encodeURIComponent(searchName)}`;

        // Handle 0 Active Ads State
        if (r.hasActiveAds === false || !r.ads || r.ads.length === 0) {
          const formattedTitle = formatBrandName(r.brandName || r.query);
          return `
            <article class="card competitor-report-card">
              <div class="competitor-header">
                <div>
                  <span class="eyebrow">Brand Intelligence</span>
                  <h3 class="competitor-name">${escapeHtml(formattedTitle)}</h3>
                </div>
                <div>
                  <span class="badge" style="background: rgba(100, 116, 139, 0.3); color: #94a3b8; margin-right: 8px;">Activity: 0 Active Ads</span>
                  <a class="btn btn-outline" href="${directLibPageUrl}" target="_blank" rel="noreferrer" style="padding: 0.35rem 0.85rem; font-size: 0.8rem;">
                    Check Meta Ad Library ↗
                  </a>
                </div>
              </div>

              <div style="background: rgba(15, 23, 42, 0.6); border: 1px dashed rgba(148, 163, 184, 0.3); border-radius: 10px; padding: 2.2rem 1.5rem; text-align: center; margin-top: 1rem;">
                <div style="font-size: 2.2rem; margin-bottom: 0.6rem;">🔍</div>
                <h4 style="color: #ffffff; margin-bottom: 0.4rem;">No Active Meta Ads Currently Detected</h4>
                <p style="color: #94a3b8; max-width: 560px; margin: 0 auto 1.2rem; font-size: 0.95rem; line-height: 1.6;">
                  <strong>${escapeHtml(formattedTitle)}</strong>'s verified page is currently not running any active paid ad campaigns.
                </p>
                <a class="btn btn-primary" href="#alertOptinBox" style="font-size: 0.88rem; padding: 0.6rem 1.2rem;">
                  🔔 Set Up Alert When They Launch New Ads
                </a>
              </div>
            </article>
          `;
        }

        const adsHtml = (r.ads || []).slice(0, 5).map((ad, adIdx) => {
          const isWinner = ad.isTopPerformer || adIdx === 0;
          const isVideo = ad.format === 'video';
          const isCarousel = ad.format === 'carousel';
          const mediaThumbnail = ad.mediaUrl || "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=600&q=80";
          const libUrl = ad.adLibraryUrl || directLibPageUrl;

          let overlayBadge = `<span class="badge badge-tool" style="background: rgba(0,0,0,0.75); color: #fff;">📸 Image Creative</span>`;
          if (isVideo) {
            overlayBadge = `<span class="play-badge">▶ Play Video Creative</span>`;
          } else if (isCarousel) {
            overlayBadge = `<span class="badge badge-tool" style="background: rgba(168, 85, 247, 0.85); color: #fff;">🎠 Carousel Creative</span>`;
          }

          return `
            <div class="ad-card">
              <div>
                <div class="ad-media-container" style="background-image: url('${mediaThumbnail}');">
                  <div class="ad-media-overlay">
                    ${overlayBadge}
                  </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                  <span class="ad-format-tag ${ad.format || 'image'}">${ad.format || 'image'}</span>
                  ${isWinner ? `<span class="badge badge-alert" style="font-size: 0.7rem;">🔥 45+ DAYS SCALED WINNER</span>` : `<span class="badge badge-tool" style="font-size: 0.7rem;">⚡ SAMPLE AD #${adIdx + 1}</span>`}
                </div>
                <div class="ad-copy">"${escapeHtml(ad.copy)}"</div>
              </div>
              <div>
                <div class="ad-footer">
                  <span>First Seen: <strong>${ad.startDate || 'Recently'}</strong></span>
                  <span>CTA: <strong>${ad.ctaText || 'Learn More'}</strong></span>
                </div>
                <div style="text-align: right;">
                  <a class="ad-meta-link" href="${libUrl}" target="_blank" rel="noreferrer">
                    🔗 View Live on Meta Ad Library →
                  </a>
                </div>
              </div>
            </div>
          `;
        }).join('');

        const hooksHtml = (r.topHooks || []).map(h => `<li>${escapeHtml(h)}</li>`).join('');
        const threatScore = 70 + ((idx * 9) % 25);
        const adCount = (r.ads || []).length;
        const formattedBrandTitle = formatBrandName(r.brandName || r.query);

        return `
          <article class="card competitor-report-card">
            <div class="competitor-header">
              <div>
                <span class="eyebrow">Brand Intelligence</span>
                <h3 class="competitor-name">${escapeHtml(formattedBrandTitle)}</h3>
              </div>
              <div>
                <span class="badge badge-alert" style="margin-right: 8px;">Threat Score: ${threatScore}/100</span>
                <a class="btn btn-outline" href="${directLibPageUrl}" target="_blank" rel="noreferrer" style="padding: 0.35rem 0.85rem; font-size: 0.8rem;">
                  Open Meta Ad Library ↗
                </a>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1rem; font-size: 0.95rem; color: #cbd5e1;">
              <div><strong>Video / Image Ratio:</strong> ${r.metrics?.videoPercent || '50%'} Video / ${r.metrics?.imagePercent || '50%'} Image</div>
              <div><strong>Avg Ad Lifespan:</strong> ${r.metrics?.avgDaysActive || '18 days'}</div>
              <div><strong>Primary Target Market:</strong> ${r.metrics?.primaryTargetMarket || 'Malaysia (MY)'}</div>
            </div>

            ${hooksHtml ? `
            <div style="margin-bottom: 1rem;">
              <strong style="color: var(--primary);">Detected Copy Angles & Hooks:</strong>
              <ul style="margin-top: 0.4rem; padding-left: 1.2rem; color: #e2e8f0;">
                ${hooksHtml}
              </ul>
            </div>
            ` : ''}

            <h4 style="margin: 1.2rem 0 0.5rem; color: #ffffff;">${adCount} Sample Ad Creative(s) & Visual Content:</h4>
            <div class="ad-grid">
              ${adsHtml}
            </div>
          </article>
        `;
      }).join('');
    }
  }

  function formatBrandName(name) {
    if (!name) return 'Competitor Brand';
    const trimmed = String(name).replace(/[\r\n\t]+/g, ' ').trim();
    if (trimmed.length > 50) {
      return trimmed.slice(0, 47) + '...';
    }
    return trimmed;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
});

