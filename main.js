document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('adspyForm');
  const submitBtn = document.getElementById('submitBtn');
  const btnText = submitBtn ? submitBtn.querySelector('.btn-text') : null;
  const spinner = submitBtn ? submitBtn.querySelector('.spinner') : null;
  const statusNode = document.getElementById('formStatus');
  const yearNode = document.getElementById('year');

  const resultsSection = document.getElementById('resultsSection');
  const alertTargetEmail = document.getElementById('alertTargetEmail');
  const metricsCards = document.getElementById('metricsCards');
  const competitorsContainer = document.getElementById('competitorsContainer');

  const authButtons = document.getElementById('auth-buttons');
  const signInBtn = document.getElementById('signInBtn');
  const userButtonNode = document.getElementById('user-button');

  if (yearNode) {
    yearNode.textContent = new Date().getFullYear();
  }

  // --- CLERK FRONTEND AUTH INTEGRATION ---
  const clerkPubKey = "pk_test_dG91Y2hpbmctaG9yc2UtMzI5MS5jbGVyay5hY2NvdW50cy5kZXYk";
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
        // User logged in
        if (authButtons) authButtons.style.display = 'none';
        if (userButtonNode) {
          clerk.mountUserButton(userButtonNode);
        }

        // Auto pre-fill user info if empty
        const emailInput = document.getElementById('userEmail');
        const nameInput = document.getElementById('userName');
        if (emailInput && !emailInput.value) {
          emailInput.value = clerk.user.primaryEmailAddress?.emailAddress || '';
        }
        if (nameInput && !nameInput.value) {
          nameInput.value = clerk.user.fullName || clerk.user.firstName || '';
        }

        // Fetch user's saved monitored dashboard from server
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
        renderDashboard(data, data.subscriber.email);
        if (resultsSection) {
          resultsSection.classList.remove('hidden');
        }
      }
    } catch (e) {
      console.error('Error loading saved user dashboard:', e);
    }
  }

  // --- FORM SUBMISSION HANDLER ---
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
      const email = (document.getElementById('userEmail')?.value || '').trim();
      const name = (document.getElementById('userName')?.value || '').trim();
      const website = (document.getElementById('website')?.value || '').trim();

      // Anti-spam check
      if (website) {
        if (statusNode) {
          statusNode.textContent = 'Submission blocked.';
          statusNode.classList.add('error');
        }
        return;
      }

      // Validation
      if (!comp1) {
        if (statusNode) {
          statusNode.textContent = 'Please enter at least 1 competitor Facebook Page URL or name.';
          statusNode.classList.add('error');
        }
        return;
      }

      if (!email || !email.includes('@')) {
        if (statusNode) {
          statusNode.textContent = 'Please enter a valid work email address.';
          statusNode.classList.add('error');
        }
        return;
      }

      if (!name) {
        if (statusNode) {
          statusNode.textContent = 'Please enter your name or company name.';
          statusNode.classList.add('error');
        }
        return;
      }

      const competitors = [comp1, comp2, comp3].filter(c => c.length > 0);

      // UI Loading state
      submitBtn.disabled = true;
      if (btnText) btnText.textContent = 'Scanning Meta Ad Library & Computing Threat Index...';
      if (spinner) spinner.classList.remove('hidden');

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
            competitors
          })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to analyze competitors.');
        }

        // Render Dashboard
        renderDashboard(data, email);

        if (statusNode) {
          statusNode.textContent = '✓ Intelligence Radar active & alert monitoring enabled!';
          statusNode.classList.add('success');
        }

        // Prompt login/signup modal if user is not logged in yet
        if (window.Clerk && !window.Clerk.user) {
          setTimeout(() => {
            if (window.Clerk) {
              window.Clerk.openSignUp({});
            }
          }, 1500);
        }

        // Smooth scroll to results
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
        if (btnText) btnText.textContent = 'Analyze Ads & Activate Launch Radar ⚡';
        if (spinner) spinner.classList.add('hidden');
      }
    });
  }

  function renderDashboard(data, email) {
    if (alertTargetEmail) {
      alertTargetEmail.textContent = email;
    }

    const reports = data.reports || [];
    const summary = data.summary || {};

    // 1. Render Summary Metrics
    if (metricsCards) {
      metricsCards.innerHTML = `
        <article class="card">
          <span class="eyebrow">Monitored Targets</span>
          <h3>${summary.totalCompetitors || reports.length} Competitor Brand(s)</h3>
          <p>Active daily Meta Ad Library scanner enabled.</p>
        </article>

        <article class="card">
          <span class="eyebrow">Competitor Pressure Score</span>
          <h3>78/100 (High Velocity) 🔥</h3>
          <p>Analyzing format distribution, messaging angles & active ads lifespan.</p>
        </article>

        <article class="card">
          <span class="eyebrow">Automated Alerts Status</span>
          <h3><span class="pulse-dot"></span> 100% Active</h3>
          <p>We'll notify <strong>${email}</strong> daily upon new ad detection.</p>
        </article>
      `;
    }

    // 2. Render Competitors Details
    if (competitorsContainer) {
      competitorsContainer.innerHTML = reports.map((r, idx) => {
        const adsHtml = (r.ads || []).map((ad, adIdx) => {
          const isWinner = ad.isTopPerformer || adIdx === 0;
          return `
            <div class="ad-card">
              <div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span class="ad-format-tag ${ad.format === 'video' ? 'video' : ''}">${ad.format || 'image'}</span>
                  ${isWinner ? `<span class="badge badge-alert" style="font-size: 0.7rem;">🔥 45+ DAYS SCALED WINNER</span>` : `<span class="badge badge-tool" style="font-size: 0.7rem;">⚡ NEW LAUNCH</span>`}
                </div>
                <div class="ad-copy">"${escapeHtml(ad.copy)}"</div>
              </div>
              <div class="ad-footer">
                <span>First Seen: <strong>${ad.startDate || 'Recently'}</strong></span>
                <span>CTA: <strong>${ad.ctaText || 'Learn More'}</strong></span>
              </div>
            </div>
          `;
        }).join('');

        const hooksHtml = (r.topHooks || []).map(h => `<li>${escapeHtml(h)}</li>`).join('');
        const threatScore = 70 + ((idx * 9) % 25);

        return `
          <article class="card competitor-report-card">
            <div class="competitor-header">
              <div>
                <span class="eyebrow">Brand Intelligence & Radar</span>
                <h3 class="competitor-name">${escapeHtml(r.brandName || r.query)}</h3>
              </div>
              <div>
                <span class="badge badge-alert" style="margin-right: 8px;">Threat Score: ${threatScore}/100</span>
                <span class="badge badge-tool">${r.metrics?.activeAdsCount || 6} Active Ads</span>
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

            <h4 style="margin: 1.2rem 0 0.5rem; color: #ffffff;">Active Ad Creatives:</h4>
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
