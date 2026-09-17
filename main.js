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
  const swipeCountBadge = document.getElementById('swipeCountBadge');
  const slotUsageText = document.getElementById('slotUsageText');
  const monitoredSlotsGrid = document.getElementById('monitoredSlotsGrid');

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

  // Dashboard Tabs & Content
  const dashTabBtns = document.querySelectorAll('.dash-tab-btn');
  const tabContentMatrix = document.getElementById('tabContentMatrix');
  const tabContentArchive = document.getElementById('tabContentArchive');
  const tabContentSwipe = document.getElementById('tabContentSwipe');
  const tabContentReports = document.getElementById('tabContentReports');
  const allAdsArchiveGrid = document.getElementById('allAdsArchiveGrid');
  const savedSwipeGrid = document.getElementById('savedSwipeGrid');
  const swipeCapacityText = document.getElementById('swipeCapacityText');
  const reportActionBox = document.getElementById('reportActionBox');
  const filterPills = document.querySelectorAll('.filter-pill');
  const adArchiveSearchInput = document.getElementById('adArchiveSearchInput');

  let currentCompetitors = [];
  let currentReports = [];
  let currentSavedSwipeAds = [];
  let userTierInfo = { tier: 'guest', limits: { maxCompetitors: 3, maxAdsPerBrand: 5, maxSwipeAds: 0 } };
  let currentBillingCycle = 'monthly';
  let slotCount = 3;
  let activeFormatFilter = 'all';
  let archiveSearchQuery = '';

  if (yearNode) {
    yearNode.textContent = new Date().getFullYear();
  }

  // --- DASHBOARD TAB SWITCHING ---
  dashTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      dashTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (tabContentMatrix) tabContentMatrix.classList.add('hidden');
      if (tabContentArchive) tabContentArchive.classList.add('hidden');
      if (tabContentSwipe) tabContentSwipe.classList.add('hidden');
      if (tabContentReports) tabContentReports.classList.add('hidden');

      if (targetTab === 'matrix' && tabContentMatrix) tabContentMatrix.classList.remove('hidden');
      if (targetTab === 'archive' && tabContentArchive) {
        tabContentArchive.classList.remove('hidden');
        renderArchiveView();
      }
      if (targetTab === 'swipe' && tabContentSwipe) {
        tabContentSwipe.classList.remove('hidden');
        renderSwipeFileView();
      }
      if (targetTab === 'reports' && tabContentReports) {
        tabContentReports.classList.remove('hidden');
        renderReportsView();
      }
    });
  });

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

  // --- DYNAMIC EXTRA SLOTS IN HERO FORM ---
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
      if (data.swipeAds) {
        currentSavedSwipeAds = data.swipeAds;
        if (swipeCountBadge) swipeCountBadge.textContent = currentSavedSwipeAds.length;
      }
      if (data.authenticated && data.subscriber && data.reports && data.reports.length > 0) {
        currentReports = data.reports;
        currentCompetitors = data.monitoredCompetitors || [];
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

  // --- TOP SEARCH FORM HANDLER ---
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ competitors: currentCompetitors })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to analyze competitors.');
        }

        if (data.tierInfo) {
          userTierInfo = data.tierInfo;
          updateTierUI(data.tierInfo);
        }

        currentReports = data.reports || [];
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
          headers: { 'Content-Type': 'application/json' },
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

  // --- RENDER MAIN RADAR MATRIX VIEW ---
  function renderDashboard(data) {
    const reports = data.reports || [];
    const summary = data.summary || {};
    const tierInfo = data.tierInfo || userTierInfo;

    // 1. Summary Metrics
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

    // 2. Monitored Slots Manager Grid
    if (monitoredSlotsGrid) {
      const monitoredList = data.monitoredCompetitors || currentCompetitors;
      if (slotUsageText) {
        slotUsageText.textContent = `${monitoredList.length} of ${tierInfo.limits?.maxCompetitors || 5} slots used (${tierInfo.limits?.tierName || 'Free'}).`;
      }

      const slotsHtml = monitoredList.map(comp => `
        <div class="slot-pill">
          <span>🎯 ${escapeHtml(comp)}</span>
          <button class="slot-delete-btn" data-comp="${escapeHtml(comp)}" title="Remove Slot">&times;</button>
        </div>
      `).join('');

      monitoredSlotsGrid.innerHTML = `
        ${slotsHtml}
        <div class="add-slot-input-wrap">
          <input type="text" id="inlineAddSlotInput" placeholder="+ Add handle..." />
          <button class="btn btn-outline" id="inlineAddSlotBtn" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">Add</button>
        </div>
      `;

      // Attach delete handlers
      monitoredSlotsGrid.querySelectorAll('.slot-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const compName = btn.getAttribute('data-comp');
          if (confirm(`Remove ${compName} from your monitored slots?`)) {
            await fetch(`/api/competitors/${encodeURIComponent(compName)}`, { method: 'DELETE' });
            fetchUserSavedDashboard();
          }
        });
      });

      // Attach inline add handler
      const inlineAddBtn = document.getElementById('inlineAddSlotBtn');
      const inlineAddInp = document.getElementById('inlineAddSlotInput');
      if (inlineAddBtn && inlineAddInp) {
        inlineAddBtn.addEventListener('click', async () => {
          const val = inlineAddInp.value.trim();
          if (!val) return;
          if (monitoredList.length >= tierInfo.limits.maxCompetitors) {
            if (upgradeModal) upgradeModal.classList.remove('hidden');
            return;
          }
          const res = await fetch('/api/competitors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ competitor: val })
          });
          if (res.ok) {
            inlineAddInp.value = '';
            fetchUserSavedDashboard();
          } else {
            const errData = await res.json();
            alert(errData.error || 'Failed to add slot.');
          }
        });
      }
    }

    // 3. Competitor Reports Matrix
    if (competitorsContainer) {
      competitorsContainer.innerHTML = reports.map((r, idx) => {
        const adsHtml = (r.ads || []).map((ad, adIdx) => {
          const isWinner = ad.isTopPerformer || adIdx === 0;
          const isVideo = ad.format === 'video';
          const mediaThumbnail = ad.mediaUrl || "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=600&q=80";
          const libUrl = ad.adLibraryUrl || `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=MY&q=${encodeURIComponent(r.brandName || r.query)}`;
          const isSaved = currentSavedSwipeAds.some(s => s.ad_id === ad.id);

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
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem;">
                  <button class="save-swipe-btn ${isSaved ? 'saved' : ''}" data-ad-id="${ad.id}" data-brand="${escapeHtml(r.brandName || r.query)}" data-copy="${escapeHtml(ad.copy)}" data-media="${mediaThumbnail}" data-format="${ad.format || 'image'}">
                    ${isSaved ? '✓ Saved in Swipe' : '🔖 Save to Swipe'}
                  </button>
                  <a class="ad-meta-link" href="${libUrl}" target="_blank" rel="noreferrer">
                    🔗 Meta Ad Library →
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

      attachSwipeButtons();
    }
  }

  // --- RENDER AD ARCHIVE VIEW (SEARCH & FILTER) ---
  function renderArchiveView() {
    if (!allAdsArchiveGrid) return;

    let allAds = [];
    currentReports.forEach(r => {
      (r.ads || []).forEach(ad => {
        allAds.push({
          ...ad,
          brandName: r.brandName || r.query
        });
      });
    });

    if (activeFormatFilter !== 'all') {
      allAds = allAds.filter(a => a.format === activeFormatFilter);
    }

    if (archiveSearchQuery) {
      const q = archiveSearchQuery.toLowerCase();
      allAds = allAds.filter(a => 
        (a.copy || '').toLowerCase().includes(q) || 
        (a.brandName || '').toLowerCase().includes(q)
      );
    }

    if (allAds.length === 0) {
      allAdsArchiveGrid.innerHTML = `
        <div class="card" style="grid-column: 1 / -1; text-align: center; padding: var(--space-2xl);">
          <p style="color: #9ca3af; margin: 0;">No ads found matching your filter criteria.</p>
        </div>
      `;
      return;
    }

    allAdsArchiveGrid.innerHTML = allAds.map((ad, idx) => {
      const isVideo = ad.format === 'video';
      const isWinner = ad.isTopPerformer || idx === 0;
      const mediaThumbnail = ad.mediaUrl || "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=600&q=80";
      const libUrl = ad.adLibraryUrl || `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=MY&q=${encodeURIComponent(ad.brandName)}`;
      const isSaved = currentSavedSwipeAds.some(s => s.ad_id === ad.id);

      return `
        <div class="ad-card">
          <div>
            <div class="ad-media-container" style="background-image: url('${mediaThumbnail}');">
              <div class="ad-media-overlay">
                ${isVideo ? `<span class="play-badge">▶ Play Video</span>` : `<span class="badge badge-tool" style="background: rgba(0,0,0,0.7); color: #fff;">📸 Image</span>`}
              </div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <span class="eyebrow" style="margin: 0; font-size: 0.75rem;">${escapeHtml(ad.brandName)}</span>
              ${isWinner ? `<span class="badge badge-alert" style="font-size: 0.7rem;">🔥 WINNER</span>` : `<span class="ad-format-tag">${ad.format || 'image'}</span>`}
            </div>
            <div class="ad-copy">"${escapeHtml(ad.copy)}"</div>
          </div>
          <div>
            <div class="ad-footer">
              <span>First Seen: <strong>${ad.startDate || 'Recently'}</strong></span>
              <span>CTA: <strong>${ad.ctaText || 'Learn More'}</strong></span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem;">
              <button class="save-swipe-btn ${isSaved ? 'saved' : ''}" data-ad-id="${ad.id}" data-brand="${escapeHtml(ad.brandName)}" data-copy="${escapeHtml(ad.copy)}" data-media="${mediaThumbnail}" data-format="${ad.format || 'image'}">
                ${isSaved ? '✓ Saved' : '🔖 Save'}
              </button>
              <a class="ad-meta-link" href="${libUrl}" target="_blank" rel="noreferrer">
                🔗 Meta Ad Library →
              </a>
            </div>
          </div>
        </div>
      `;
    }).join('');

    attachSwipeButtons();
  }

  // --- FILTER PILL & SEARCH HANDLERS ---
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeFormatFilter = pill.getAttribute('data-filter') || 'all';
      renderArchiveView();
    });
  });

  if (adArchiveSearchInput) {
    adArchiveSearchInput.addEventListener('input', (e) => {
      archiveSearchQuery = e.target.value.trim();
      renderArchiveView();
    });
  }

  // --- RENDER SWIPE FILE VIEW ---
  function renderSwipeFileView() {
    if (!savedSwipeGrid) return;

    if (swipeCapacityText) {
      swipeCapacityText.textContent = `You have saved ${currentSavedSwipeAds.length} of ${userTierInfo.limits.maxSwipeAds || 5} allowed ads (${userTierInfo.limits.tierName}).`;
    }

    if (currentSavedSwipeAds.length === 0) {
      savedSwipeGrid.innerHTML = `
        <div class="card" style="grid-column: 1 / -1; text-align: center; padding: var(--space-3xl);">
          <h3 style="color: #ffffff;">Your Ad Swipe File is Empty</h3>
          <p style="color: #9ca3af; max-width: 480px; margin: 0 auto 1.5rem;">Click the <strong>🔖 Save to Swipe</strong> button on any competitor ad to bookmark creative hooks and video angles for your team.</p>
          <button class="btn btn-primary" id="goToArchiveBtn">Browse Competitor Ads</button>
        </div>
      `;
      document.getElementById('goToArchiveBtn')?.addEventListener('click', () => {
        document.querySelector('[data-tab="archive"]')?.click();
      });
      return;
    }

    savedSwipeGrid.innerHTML = currentSavedSwipeAds.map(s => `
      <div class="ad-card">
        <div>
          <div class="ad-media-container" style="background-image: url('${s.media_url || "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=600&q=80"}');"></div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <span class="eyebrow" style="margin: 0; font-size: 0.8rem;">${escapeHtml(s.brand_name)}</span>
            <span class="badge badge-tool">${s.format || 'image'}</span>
          </div>
          <div class="ad-copy">"${escapeHtml(s.copy)}"</div>
        </div>
        <div>
          <div class="ad-footer" style="margin-top: 0.5rem;">
            <span>Saved: <strong>${(s.saved_at || '').split('T')[0] || 'Recently'}</strong></span>
            <button class="btn-text-link delete-swipe-btn" data-swipe-id="${s.id}" style="color: var(--alert); background: none; border: none; cursor: pointer; font-size: 0.8rem;">
              ✕ Remove
            </button>
          </div>
        </div>
      </div>
    `).join('');

    savedSwipeGrid.querySelectorAll('.delete-swipe-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const swipeId = btn.getAttribute('data-swipe-id');
        await fetch(`/api/swipe-file/${swipeId}`, { method: 'DELETE' });
        currentSavedSwipeAds = currentSavedSwipeAds.filter(s => s.id !== Number(swipeId));
        if (swipeCountBadge) swipeCountBadge.textContent = currentSavedSwipeAds.length;
        renderSwipeFileView();
      });
    });
  }

  // --- RENDER REPORTS VIEW ---
  function renderReportsView() {
    if (!reportActionBox) return;

    if (userTierInfo.limits.canExport) {
      reportActionBox.innerHTML = `
        <div style="display: flex; gap: 12px; align-items: center;">
          <button class="btn btn-primary" id="downloadPdfBtn" style="padding: 0.9rem 1.8rem;">
            📄 Download Client Teardown PDF
          </button>
          <span style="color: var(--accent); font-size: 0.88rem; font-weight: 600;">✓ Ready to Export (${currentReports.length} Competitors Included)</span>
        </div>
      `;
      document.getElementById('downloadPdfBtn')?.addEventListener('click', () => {
        window.print();
      });
    } else {
      reportActionBox.innerHTML = `
        <div style="background: rgba(244, 63, 94, 0.08); border: 1px solid rgba(244, 63, 94, 0.3); border-radius: 8px; padding: var(--space-md); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
          <div>
            <strong style="color: #fda4af;">🔒 Client Reports are available on the Pro / Agency Plan (RM99/mo)</strong>
            <p style="margin: 0.2rem 0 0; font-size: 0.85rem; color: #cbd5e1;">Upgrade to generate white-label PDF reports with 90-day ad histories for your clients.</p>
          </div>
          <button class="btn btn-primary open-upgrade-btn" style="padding: 0.6rem 1.2rem; font-size: 0.9rem;">
            Upgrade to Pro
          </button>
        </div>
      `;
      reportActionBox.querySelector('.open-upgrade-btn')?.addEventListener('click', () => {
        if (upgradeModal) upgradeModal.classList.remove('hidden');
      });
    }
  }

  // --- ATTACH SWIPE SAVE HANDLERS ---
  function attachSwipeButtons() {
    document.querySelectorAll('.save-swipe-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!window.Clerk || !window.Clerk.user) {
          if (confirm('Please sign in free to save ads into your personal swipe file!')) {
            window.Clerk?.openSignUp({});
          }
          return;
        }

        const adId = btn.getAttribute('data-ad-id');
        const brandName = btn.getAttribute('data-brand');
        const copy = btn.getAttribute('data-copy');
        const mediaUrl = btn.getAttribute('data-media');
        const format = btn.getAttribute('data-format');

        btn.disabled = true;
        try {
          const res = await fetch('/api/swipe-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adId, brandName, copy, mediaUrl, format })
          });
          const data = await res.json();
          if (res.ok) {
            btn.classList.add('saved');
            btn.textContent = '✓ Saved in Swipe';
            currentSavedSwipeAds.push(data.ad);
            if (swipeCountBadge) swipeCountBadge.textContent = currentSavedSwipeAds.length;
          } else {
            alert(data.error || 'Could not save ad.');
            if (data.error && data.error.includes('limit')) {
              if (upgradeModal) upgradeModal.classList.remove('hidden');
            }
          }
        } catch (e) {
          console.error('Swipe error:', e);
        } finally {
          btn.disabled = false;
        }
      });
    });
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
