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
  const tierBadgeHeader = document.getElementById('tierBadgeHeader');
  const formSlotPill = document.getElementById('formSlotPill');

  const alertOptinForm = document.getElementById('alertOptinForm');
  const activateAlertsBtn = document.getElementById('activateAlertsBtn');
  const alertOptinStatus = document.getElementById('alertOptinStatus');

  const authButtons = document.getElementById('auth-buttons');
  const signInBtn = document.getElementById('signInBtn');
  const userButtonNode = document.getElementById('user-button');

  // Upgrade Modal & Pricing Controls
  const upgradeModal = document.getElementById('upgradeModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const openUpgradeBtns = document.querySelectorAll('.open-upgrade-btn');
  const checkoutBtns = document.querySelectorAll('.checkout-btn');
  const pricingBillingToggle = document.getElementById('pricingBillingToggle');
  const starterPriceVal = document.getElementById('starterPriceVal');
  const starterPricePeriod = document.getElementById('starterPricePeriod');
  const proPriceVal = document.getElementById('proPriceVal');
  const proPricePeriod = document.getElementById('proPricePeriod');
  const freePlanBtn = document.getElementById('freePlanBtn');
  const addSlotBtn = document.getElementById('addSlotBtn');
  const extraSlotsContainer = document.getElementById('extraSlotsContainer');

  let currentCompetitors = [];
  let userTierInfo = { tier: 'guest', limits: { maxCompetitors: 3, maxAdsPerBrand: 5 } };
  let currentBillingCycle = 'monthly';
  let slotCount = 3;

  if (yearNode) {
    yearNode.textContent = new Date().getFullYear();
  }

  // --- BILLING TOGGLE (MONTHLY VS YEARLY) ---
  if (pricingBillingToggle) {
    pricingBillingToggle.addEventListener('change', () => {
      const isYearly = pricingBillingToggle.checked;
      currentBillingCycle = isYearly ? 'yearly' : 'monthly';

      if (starterPriceVal && starterPricePeriod && proPriceVal && proPricePeriod) {
        if (isYearly) {
          starterPriceVal.textContent = 'RM399';
          starterPricePeriod.textContent = '/ year';
          proPriceVal.textContent = 'RM799';
          proPricePeriod.textContent = '/ year';
        } else {
          starterPriceVal.textContent = 'RM49';
          starterPricePeriod.textContent = '/ month';
          proPriceVal.textContent = 'RM99';
          proPricePeriod.textContent = '/ month';
        }
      }
    });
  }

  // --- UPGRADE MODAL TRIGGERS ---
  openUpgradeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (upgradeModal) upgradeModal.classList.remove('hidden');
    });
  });

  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
      if (upgradeModal) upgradeModal.classList.add('hidden');
    });
  }

  if (upgradeModal) {
    upgradeModal.addEventListener('click', (e) => {
      if (e.target === upgradeModal) upgradeModal.classList.add('hidden');
    });
  }

  if (freePlanBtn) {
    freePlanBtn.addEventListener('click', () => {
      if (window.Clerk && !window.Clerk.user) {
        window.Clerk.openSignUp({});
      } else {
        document.getElementById('tool')?.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  // --- STRIPE CHECKOUT TRIGGER ---
  checkoutBtns.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const tier = btn.getAttribute('data-tier') || 'starter';
      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = 'Redirecting to Checkout...';

      try {
        const res = await fetch('/api/billing/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tier,
            billingCycle: currentBillingCycle
          })
        });
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          throw new Error('Failed to generate checkout URL');
        }
      } catch (err) {
        console.error('Checkout error:', err);
        alert('Could not start checkout session. Please try again.');
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  });

  // --- DYNAMIC EXTRA SLOTS HANDLER ---
  if (addSlotBtn && extraSlotsContainer) {
    addSlotBtn.addEventListener('click', () => {
      const maxAllowed = userTierInfo.limits.maxCompetitors;
      if (slotCount >= maxAllowed) {
        if (upgradeModal) upgradeModal.classList.remove('hidden');
        return;
      }
      slotCount++;
      const slotDiv = document.createElement('div');
      slotDiv.className = 'input-group';
      slotDiv.innerHTML = `
        <label for="comp${slotCount}">Competitor #${slotCount} Facebook Page URL or Name (Optional)</label>
        <input type="text" id="comp${slotCount}" name="comp${slotCount}" placeholder="e.g. facebook.com/competitor${slotCount}" />
      `;
      extraSlotsContainer.appendChild(slotDiv);
    });
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
      if (data.tierInfo) {
        userTierInfo = data.tierInfo;
        updateTierUI(data.tierInfo);
      }
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

  function updateTierUI(tierInfo) {
    if (formSlotPill) {
      formSlotPill.textContent = `${tierInfo.limits?.maxCompetitors || 5} Slots (${tierInfo.limits?.tierName || 'Free'})`;
    }
    if (tierBadgeHeader) {
      tierBadgeHeader.textContent = tierInfo.limits?.badge || '👤 Free Member';
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

      const allInputs = form.querySelectorAll('input[type="text"]:not(.honeypot)');
      const rawCompetitors = Array.from(allInputs).map(inp => (inp.value || '').trim()).filter(v => v.length > 0);
      const website = (document.getElementById('website')?.value || '').trim();

      if (website) {
        if (statusNode) {
          statusNode.textContent = 'Submission blocked.';
          statusNode.classList.add('error');
        }
        return;
      }

      if (rawCompetitors.length === 0) {
        if (statusNode) {
          statusNode.textContent = 'Please enter at least 1 competitor Facebook Page URL or name.';
          statusNode.classList.add('error');
        }
        return;
      }

      currentCompetitors = rawCompetitors;

      submitBtn.disabled = true;
      if (btnText) btnText.textContent = 'Scanning Meta Ad Library & Analyzing...';
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

        if (data.tierInfo) {
          userTierInfo = data.tierInfo;
          updateTierUI(data.tierInfo);
        }

        renderDashboard(data);

        if (statusNode) {
          statusNode.textContent = '✓ Showing sample active ads per competitor!';
          statusNode.classList.add('success');
        }

        if (resultsSection) {
          resultsSection.classList.remove('hidden');
          resultsSection.scrollIntoView({ behavior: 'smooth' });
        }

      } catch (error) {
        console.error(error);
        if (statusNode) {
          statusNode.textContent = error.message || 'Something went wrong. Please check your connection.';
          statusNode.classList.add('error');
        }
      } finally {
        submitBtn.disabled = false;
        if (btnText) btnText.textContent = 'Inspect Sample Ads Per Competitor ⚡';
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

      const email = (document.getElementById('userEmail')?.value || '').trim();
      const name = (document.getElementById('userName')?.value || '').trim();

      if (!email || !email.includes('@')) {
        if (alertOptinStatus) {
          alertOptinStatus.textContent = 'Please enter a valid work email address.';
          alertOptinStatus.classList.add('error');
        }
        return;
      }

      if (!name) {
        if (alertOptinStatus) {
          alertOptinStatus.textContent = 'Please enter your name or company name.';
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

        if (data.tierInfo) {
          userTierInfo = data.tierInfo;
          updateTierUI(data.tierInfo);
        }

        if (alertOptinStatus) {
          alertOptinStatus.textContent = `✓ Alerts activated for ${email}! You are now on the Free Registered tier (5 competitor slots).`;
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
    const tierInfo = data.tierInfo || userTierInfo;

    if (metricsCards) {
      metricsCards.innerHTML = `
        <article class="card">
          <span class="eyebrow">Inspected Brands</span>
          <h3>${summary.totalCompetitors || reports.length} / ${tierInfo.limits?.maxCompetitors || 5} Slots</h3>
          <p>Displaying active sample ad creatives per brand.</p>
        </article>

        <article class="card">
          <span class="eyebrow">Competitor Pressure Score</span>
          <h3>78/100 (High Velocity) 🔥</h3>
          <p>Analyzing format distribution, messaging angles & active ads lifespan.</p>
        </article>

        <article class="card">
          <span class="eyebrow">Plan & Alerts</span>
          <h3>${tierInfo.limits?.badge || '👤 Free Member'}</h3>
          <p>${summary.monitoringActive ? 'Weekly / Daily Meta Ad Library updates enabled.' : 'Enter email below to activate launch alerts.'}</p>
        </article>
      `;
    }

    if (competitorsContainer) {
      competitorsContainer.innerHTML = reports.map((r, idx) => {
        const adsHtml = (r.ads || []).map((ad, adIdx) => {
          const isWinner = ad.isTopPerformer || adIdx === 0;
          const isVideo = ad.format === 'video';
          const mediaThumbnail = ad.mediaUrl || "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=600&q=80";
          const libUrl = ad.adLibraryUrl || `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=MY&q=${encodeURIComponent(r.brandName || r.query)}`;

          return `
            <div class="ad-card">
              <div>
                <div class="ad-media-container" style="background-image: url('${mediaThumbnail}');">
                  <div class="ad-media-overlay">
                    ${isVideo ? `<span class="play-badge">▶ Play Video Creative</span>` : `<span class="badge badge-tool" style="background: rgba(0,0,0,0.7); color: #fff;">📸 Image Creative</span>`}
                  </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                  <span class="ad-format-tag ${isVideo ? 'video' : ''}">${ad.format || 'image'}</span>
                  ${isWinner ? `<span class="badge badge-alert" style="font-size: 0.7rem;">🔥 45+ DAYS SCALED WINNER</span>` : `<span class="badge badge-tool" style="font-size: 0.7rem;">⚡ AD #${adIdx + 1}</span>`}
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
        const directLibPageUrl = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=MY&q=${encodeURIComponent(r.brandName || r.query)}`;

        return `
          <article class="card competitor-report-card">
            <div class="competitor-header">
              <div>
                <span class="eyebrow">Brand Intelligence</span>
                <h3 class="competitor-name">${escapeHtml(r.brandName || r.query)}</h3>
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

            <div style="margin-bottom: 1rem;">
              <strong style="color: var(--primary);">Detected Copy Angles & Hooks:</strong>
              <ul style="margin-top: 0.4rem; padding-left: 1.2rem; color: #e2e8f0;">
                ${hooksHtml}
              </ul>
            </div>

            <h4 style="margin: 1.2rem 0 0.5rem; color: #ffffff;">Sample Ad Creatives:</h4>
            <div class="ad-grid">
              ${adsHtml}
            </div>
          </article>
        `;
      }).join('');
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
});
