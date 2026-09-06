/**
 * AutoTest Pro — Dashboard Application Logic
 * Handles URL submission, SSE streaming, result rendering, 
 * history management, and export functionality.
 * 
 * 100% local — zero external data transmission.
 */

// ── State ──
let currentSessionId = null;
let currentResults = [];
let currentSummary = null;
let eventSource = null;
let activeAuthTab = 'none';
let selectedSessionId = null;
let savedSessions = [];

// ── DOM References ──
const urlInput = document.getElementById('url-input');
const btnStart = document.getElementById('btn-start');
const btnExport = document.getElementById('btn-export');
const btnExportJunit = document.getElementById('btn-export-junit');
const btnHistory = document.getElementById('btn-history');
const btnCloseHistory = document.getElementById('btn-close-history');
const urlSection = document.getElementById('url-section');
const scanProgress = document.getElementById('scan-progress');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const resultsSection = document.getElementById('results-section');
const categoriesContainer = document.getElementById('categories-container');
const screenshotsSection = document.getElementById('screenshots-section');
const screenshotsGrid = document.getElementById('screenshots-grid');
const historyModal = document.getElementById('history-modal');
const historyList = document.getElementById('history-list');

// Auth DOM
const authSection = document.getElementById('auth-section');
const authToggle = document.getElementById('auth-toggle');
const authDrawer = document.getElementById('auth-drawer');
const authStatusBadge = document.getElementById('auth-status-badge');
const authTabs = document.querySelectorAll('.auth-tab');
const savedSessionsCount = document.getElementById('saved-sessions-count');
const savedSessionsList = document.getElementById('saved-sessions-list');
const btnLaunchSSO = document.getElementById('btn-launch-sso');
const ssoStatus = document.getElementById('sso-status');
const btnTestFormLogin = document.getElementById('btn-test-form-login');
const formLoginStatus = document.getElementById('form-login-status');
const authLoginUrl = document.getElementById('auth-login-url');
const authUsername = document.getElementById('auth-username');
const authPassword = document.getElementById('auth-password');
const btnTogglePwd = document.getElementById('btn-toggle-pwd');
const authTokenInput = document.getElementById('auth-token-input');
const btnApplyToken = document.getElementById('btn-apply-token');
const tokenStatus = document.getElementById('token-status');
const linkOpenLogin = document.getElementById('link-open-login');
const btnOpenExternal = document.getElementById('btn-open-external');

// Stat elements
const scoreNumber = document.getElementById('score-number');
const scoreGrade = document.getElementById('score-grade');
const scoreRingFill = document.getElementById('score-ring-fill');
const statTotal = document.getElementById('stat-total');
const statPassed = document.getElementById('stat-passed');
const statFailed = document.getElementById('stat-failed');
const statWarnings = document.getElementById('stat-warnings');
const infoUrl = document.getElementById('info-url');
const infoPages = document.getElementById('info-pages');
const infoDuration = document.getElementById('info-duration');
const infoTimestamp = document.getElementById('info-timestamp');

// Total test categories (for progress estimation)
const TOTAL_CATEGORIES = 10; // crawler + 9 test modules

// ── Event Listeners ──
btnStart.addEventListener('click', startTest);
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startTest();
});
btnExport.addEventListener('click', exportResults);
if (btnExportJunit) {
  btnExportJunit.addEventListener('click', () => {
    if (currentSessionId) {
      window.open(`/api/test/${currentSessionId}/junit`, '_blank');
    }
  });
}
btnHistory.addEventListener('click', showHistory);
btnCloseHistory.addEventListener('click', () => historyModal.hidden = true);
document.querySelector('.modal-backdrop')?.addEventListener('click', () => historyModal.hidden = true);

// Auth Drawer Toggles & Tabs
if (authToggle) {
  authToggle.addEventListener('click', () => {
    const isHidden = authDrawer.hidden;
    authDrawer.hidden = !isHidden;
    authSection.classList.toggle('open', !isHidden);
  });
}

authTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.getAttribute('data-tab');
    switchAuthTab(targetTab);
  });
});

if (btnLaunchSSO) btnLaunchSSO.addEventListener('click', launchSSOLogin);
if (btnTestFormLogin) btnTestFormLogin.addEventListener('click', testFormLogin);

// Toggle password visibility
if (btnTogglePwd && authPassword) {
  btnTogglePwd.addEventListener('click', () => {
    const isPassword = authPassword.type === 'password';
    authPassword.type = isPassword ? 'text' : 'password';
    btnTogglePwd.textContent = isPassword ? '🙈' : '👁️';
  });
}

// Update login links dynamically
function updateLoginLinks() {
  const currentUrl = (authLoginUrl && authLoginUrl.value.trim()) || urlInput.value.trim();
  const safeUrl = currentUrl ? (/^https?:\/\//i.test(currentUrl) ? currentUrl : 'https://' + currentUrl) : '#';
  if (linkOpenLogin) linkOpenLogin.href = safeUrl;
  if (btnOpenExternal) btnOpenExternal.href = safeUrl;
}
urlInput.addEventListener('input', updateLoginLinks);
if (authLoginUrl) authLoginUrl.addEventListener('input', updateLoginLinks);

// ── Start Test ──
async function startTest() {
  let url = urlInput.value.trim();
  if (!url) {
    urlInput.focus();
    shakeElement(urlInput);
    return;
  }

  // Auto-prepend https if missing
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
    urlInput.value = url;
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    shakeElement(urlInput);
    return;
  }

  // Reset state
  currentResults = [];
  currentSummary = null;
  categoriesContainer.innerHTML = '';
  screenshotsGrid.innerHTML = '';
  screenshotsSection.hidden = true;
  resultsSection.hidden = true;

  // UI: Show scanning state
  btnStart.querySelector('.btn-text').hidden = true;
  btnStart.querySelector('.btn-loader').hidden = false;
  btnStart.disabled = true;
  urlInput.disabled = true;
  urlSection.classList.add('scanning');
  scanProgress.hidden = false;
  progressFill.style.width = '5%';
  progressText.textContent = 'Starting test...';

  // Construct auth options
  let authPayload = null;
  if (selectedSessionId) {
    authPayload = { sessionId: selectedSessionId };
  } else if (activeAuthTab === 'form') {
    const username = authUsername ? authUsername.value.trim() : '';
    const password = authPassword ? authPassword.value : '';
    const loginUrl = (authLoginUrl && authLoginUrl.value.trim()) || url;
    const userSel = document.getElementById('auth-user-selector')?.value.trim();
    const passSel = document.getElementById('auth-pass-selector')?.value.trim();
    const subSel = document.getElementById('auth-submit-selector')?.value.trim();

    if (username && password) {
      authPayload = {
        mode: 'form',
        loginUrl,
        credentials: {
          username,
          password,
          usernameSelector: userSel || undefined,
          passwordSelector: passSel || undefined,
          submitSelector: subSel || undefined
        }
      };
    }
  }

  try {
    const response = await fetch('/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, auth: authPayload })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to start test');
    }

    const { sessionId } = await response.json();
    currentSessionId = sessionId;

    // Connect to SSE stream
    connectSSE(sessionId);
  } catch (err) {
    resetUI();
    alert('Error: ' + err.message);
  }
}

// ── SSE Connection ──
function connectSSE(sessionId) {
  if (eventSource) {
    eventSource.close();
  }

  eventSource = new EventSource(`/api/test/${sessionId}/stream`);
  let categoryCount = 0;

  eventSource.onmessage = (event) => {
    const { type, data } = JSON.parse(event.data);

    switch (type) {
      case 'result':
        handleResult(data);
        categoryCount++;
        const progress = Math.min(95, Math.round((categoryCount / TOTAL_CATEGORIES) * 95));
        progressFill.style.width = progress + '%';
        progressText.textContent = data.message || `Running: ${data.category}...`;
        break;

      case 'complete':
        handleComplete(data);
        eventSource.close();
        break;

      case 'error':
        handleError(data);
        eventSource.close();
        break;
    }
  };

  eventSource.onerror = () => {
    // SSE can error on completion, check if we already completed
    if (!currentSummary) {
      setTimeout(() => {
        if (!currentSummary) {
          // Try to fetch results directly
          fetchFinalResults(sessionId);
        }
      }, 2000);
    }
    eventSource.close();
  };
}

// ── Handle incoming result ──
function handleResult(result) {
  if (result.status === 'running') {
    // Show running indicator for this category
    renderCategoryRunning(result.category);
    return;
  }

  currentResults.push(result);
  resultsSection.hidden = false;
  renderCategory(result);
  collectScreenshots(result);
}

// ── Handle test completion ──
function handleComplete(summary) {
  currentSummary = summary;

  // Progress bar complete
  progressFill.style.width = '100%';
  progressText.textContent = 'Test complete!';

  setTimeout(() => {
    resetUI();
    scanProgress.hidden = true;

    // Render summary
    renderSummary(summary);

    // Enable export
    btnExport.disabled = false;
    if (btnExportJunit) btnExportJunit.disabled = false;

    // Save to history
    saveToHistory(summary);
  }, 500);
}

function handleError(error) {
  resetUI();
  scanProgress.hidden = true;
  progressText.textContent = 'Error: ' + error.message;
  alert('Test failed: ' + error.message);
}

async function fetchFinalResults(sessionId) {
  try {
    const res = await fetch(`/api/test/${sessionId}/results`);
    const data = await res.json();
    if (data.completed && data.summary) {
      handleComplete(data.summary);
    }
  } catch {
    // Silently fail
  }
}

// ── Render Summary ──
function renderSummary(summary) {
  // Animate score
  animateCounter(scoreNumber, summary.healthScore, 1500);
  scoreGrade.textContent = `Grade: ${summary.grade}`;

  // Score ring animation
  const circumference = 2 * Math.PI * 52; // r=52
  const offset = circumference - (summary.healthScore / 100) * circumference;

  // Add gradient def if not exists
  addScoreGradient();
  
  setTimeout(() => {
    scoreRingFill.style.strokeDashoffset = offset;
  }, 100);

  // Ring color based on score
  const ringColor = summary.healthScore >= 80 ? '#10b981' :
                    summary.healthScore >= 60 ? '#f59e0b' : '#ef4444';
  updateScoreGradient(ringColor);

  // Animate stat counters
  animateCounter(statTotal, summary.totalTests, 1000);
  animateCounter(statPassed, summary.passed, 1200);
  animateCounter(statFailed, summary.failed, 1200);
  animateCounter(statWarnings, summary.warnings, 1200);

  // Test info
  infoUrl.textContent = summary.url;
  infoUrl.href = summary.url;
  infoPages.textContent = summary.pagesScanned;
  infoDuration.textContent = formatDuration(summary.duration);
  infoTimestamp.textContent = new Date(summary.timestamp).toLocaleString();
}

function addScoreGradient() {
  const svg = document.querySelector('.score-ring');
  if (!svg.querySelector('#score-gradient')) {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <linearGradient id="score-gradient" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#10b981"/>
        <stop offset="100%" stop-color="#6366f1"/>
      </linearGradient>
    `;
    svg.insertBefore(defs, svg.firstChild);
    scoreRingFill.setAttribute('stroke', 'url(#score-gradient)');
  }
}

function updateScoreGradient(color) {
  const stops = document.querySelectorAll('#score-gradient stop');
  if (stops.length >= 2) {
    stops[0].setAttribute('stop-color', color);
  }
}

// ── Render Category ──
function renderCategoryRunning(categoryName) {
  const existingCard = document.querySelector(`[data-category="${categoryName}"]`);
  if (existingCard) return;

  const card = document.createElement('div');
  card.className = 'category-card glass-card';
  card.setAttribute('data-category', categoryName);
  card.innerHTML = `
    <div class="category-header">
      <div class="category-status-dot running"></div>
      <div class="category-name">${categoryName}</div>
      <div class="category-stats">
        <span style="font-size:0.8rem; color:var(--text-muted);">Running...</span>
      </div>
    </div>
  `;
  categoriesContainer.appendChild(card);
}

function renderCategory(result) {
  // Remove running indicator
  const existingCard = document.querySelector(`[data-category="${result.category}"]`);
  if (existingCard) existingCard.remove();

  const card = document.createElement('div');
  card.className = 'category-card glass-card';
  card.setAttribute('data-category', result.category);

  // Count stats
  const passed = result.tests.filter(t => t.status === 'pass').length;
  const failed = result.tests.filter(t => t.status === 'fail').length;
  const warned = result.tests.filter(t => t.status === 'warn').length;

  const overallStatus = failed > 0 ? 'fail' : warned > 0 ? 'warn' : 'pass';

  let statsHtml = '';
  if (passed > 0) statsHtml += `<span class="category-stat pass">${passed} passed</span>`;
  if (failed > 0) statsHtml += `<span class="category-stat fail">${failed} failed</span>`;
  if (warned > 0) statsHtml += `<span class="category-stat warn">${warned} warnings</span>`;

  // Build tests HTML
  let testsHtml = '';
  for (const test of result.tests) {
    const detailsId = `details-${Math.random().toString(36).substr(2, 8)}`;
    const detailsHtml = test.details
      ? `<span class="test-details-toggle" onclick="toggleDetails('${detailsId}')">Show Details</span>
         <div class="test-details" id="${detailsId}">${JSON.stringify(test.details, null, 2)}</div>`
      : '';

    testsHtml += `
      <div class="test-row">
        <span class="test-status-badge ${test.status}">${test.status}</span>
        <div class="test-content">
          <div class="test-name">${escapeHtml(test.name)}</div>
          <div class="test-message">${escapeHtml(test.message)}</div>
          ${detailsHtml}
        </div>
      </div>
    `;
  }

  card.innerHTML = `
    <div class="category-header" onclick="toggleCategory(this)">
      <div class="category-status-dot ${overallStatus}"></div>
      <div class="category-name">${result.category}</div>
      <div class="category-stats">${statsHtml}</div>
      <svg class="category-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <div class="category-body">
      <div class="category-tests">${testsHtml}</div>
    </div>
  `;

  categoriesContainer.appendChild(card);

  // Auto-expand categories with failures
  if (failed > 0) {
    card.classList.add('expanded');
  }
}

// ── Collect & Render Screenshots ──
function collectScreenshots(result) {
  if (result.category !== 'Responsive Design') return;

  const screenshotTests = result.tests.filter(t =>
    t.details && t.details.screenshotUrl
  );

  if (screenshotTests.length === 0) return;

  screenshotsSection.hidden = false;
  screenshotsGrid.innerHTML = '';

  for (const test of screenshotTests) {
    const card = document.createElement('div');
    card.className = 'screenshot-card';
    card.innerHTML = `
      <div class="screenshot-label">
        <span>${test.name}</span>
        <span class="viewport-size">${test.details.viewport}</span>
      </div>
      <img class="screenshot-img" src="${test.details.screenshotUrl}" alt="${test.name}" loading="lazy"/>
    `;
    screenshotsGrid.appendChild(card);
  }
}

// ── Toggle Functions ──
window.toggleCategory = function(header) {
  const card = header.closest('.category-card');
  card.classList.toggle('expanded');
};

window.toggleDetails = function(id) {
  const el = document.getElementById(id);
  el.classList.toggle('visible');
  const toggle = el.previousElementSibling;
  toggle.textContent = el.classList.contains('visible') ? 'Hide Details' : 'Show Details';
};

// ── Load Past Session ──
async function loadSession(sessionId) {
  try {
    const res = await fetch(`/api/test/${sessionId}/results`);
    if (!res.ok) throw new Error('Session not found');
    const data = await res.json();

    if (!data.summary) return;

    currentSessionId = data.id;
    currentResults = data.results || [];
    currentSummary = data.summary;

    urlInput.value = data.url;
    categoriesContainer.innerHTML = '';
    screenshotsGrid.innerHTML = '';
    screenshotsSection.hidden = true;

    // Render summary
    renderSummary(data.summary);

    // Render categories & screenshots
    for (const result of currentResults) {
      if (result.status !== 'running') {
        renderCategory(result);
        collectScreenshots(result);
      }
    }

    resultsSection.hidden = false;
    btnExport.disabled = false;
    if (btnExportJunit) btnExportJunit.disabled = false;
    historyModal.hidden = true;
  } catch (err) {
    console.error('Failed to load session:', err);
  }
}
window.loadSession = loadSession;

// ── History ──
function saveToHistory(summary) {
  const history = getHistory();
  // Don't duplicate if already latest
  if (history.length > 0 && history[0].url === summary.url && history[0].timestamp === summary.timestamp) {
    return;
  }
  history.unshift({
    id: currentSessionId,
    url: summary.url,
    healthScore: summary.healthScore,
    grade: summary.grade,
    totalTests: summary.totalTests,
    passed: summary.passed,
    failed: summary.failed,
    timestamp: summary.timestamp
  });

  if (history.length > 50) history.length = 50;
  localStorage.setItem('autotest-history', JSON.stringify(history));
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem('autotest-history') || '[]');
  } catch {
    return [];
  }
}

async function showHistory() {
  historyModal.hidden = false;
  historyList.innerHTML = '<p class="empty-state">Loading history...</p>';

  let items = [];

  // Try fetching from server first
  try {
    const res = await fetch('/api/tests');
    if (res.ok) {
      const serverSessions = await res.json();
      items = serverSessions
        .filter(s => s.completed && s.summary)
        .map(s => ({
          id: s.id,
          url: s.url,
          healthScore: s.summary.healthScore,
          grade: s.summary.grade,
          totalTests: s.summary.totalTests,
          passed: s.summary.passed,
          failed: s.summary.failed,
          timestamp: s.summary.timestamp || s.startTime
        }))
        .reverse();
    }
  } catch (e) {
    console.warn('Failed to load server history:', e);
  }

  // Fallback to local storage if server returned nothing
  if (items.length === 0) {
    items = getHistory();
  }

  if (items.length === 0) {
    historyList.innerHTML = '<p class="empty-state">No test history yet. Run your first test!</p>';
    return;
  }

  historyList.innerHTML = items.map(item => {
    const scoreColor = item.healthScore >= 80 ? 'var(--color-pass)' :
                       item.healthScore >= 60 ? 'var(--color-warn)' : 'var(--color-fail)';
    const scoreBg = item.healthScore >= 80 ? 'var(--color-pass-bg)' :
                    item.healthScore >= 60 ? 'var(--color-warn-bg)' : 'var(--color-fail-bg)';

    const clickAction = item.id ? `loadSession('${item.id}')` : `loadFromHistory('${escapeHtml(item.url)}')`;

    return `
      <div class="history-item" onclick="${clickAction}">
        <span class="history-url">${escapeHtml(item.url)}</span>
        <div class="history-meta">
          <span class="history-score" style="background:${scoreBg}; color:${scoreColor};">
            ${item.healthScore} (${item.grade})
          </span>
          <span class="history-date">${new Date(item.timestamp).toLocaleDateString()}</span>
        </div>
      </div>
    `;
  }).join('');
}

window.loadFromHistory = function(url) {
  urlInput.value = url;
  historyModal.hidden = true;
};

// ── Export ──
function exportResults() {
  if (!currentSummary) return;

  const exportData = {
    summary: currentSummary,
    results: currentResults,
    exportedAt: new Date().toISOString(),
    tool: 'AutoTest Pro v1.0'
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `autotest-results-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Utilities ──
function resetUI() {
  btnStart.querySelector('.btn-text').hidden = false;
  btnStart.querySelector('.btn-loader').hidden = true;
  btnStart.disabled = false;
  urlInput.disabled = false;
  urlSection.classList.remove('scanning');
}

function animateCounter(element, target, duration) {
  const start = parseInt(element.textContent) || 0;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + (target - start) * eased);

    element.textContent = current;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

function formatDuration(ms) {
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function shakeElement(el) {
  el.style.animation = 'none';
  el.offsetHeight; // trigger reflow
  el.style.animation = 'shake 0.5s ease';
  el.style.borderColor = 'var(--color-fail)';
  setTimeout(() => { el.style.borderColor = ''; }, 2000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// ── Keydown & Global Listeners ──
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !historyModal.hidden) {
    historyModal.hidden = true;
  }
});

// ── Shake animation (injected) ──
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-8px); }
    40% { transform: translateX(8px); }
    60% { transform: translateX(-4px); }
    80% { transform: translateX(4px); }
  }
`;
document.head.appendChild(shakeStyle);

// ── Auth Logic ──
function switchAuthTab(tabId) {
  activeAuthTab = tabId;
  authTabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === tabId));
  
  document.querySelectorAll('.auth-tab-content').forEach(c => {
    c.hidden = c.id !== `tab-${tabId}`;
    c.classList.toggle('active', c.id === `tab-${tabId}`);
  });

  if (tabId === 'none') {
    selectedSessionId = null;
    updateAuthBadge('Public (No Auth)', false);
    authSection.classList.remove('authenticated');
  } else if (tabId === 'form') {
    updateAuthBadge('Credentials Configured', true);
  } else if (tabId === 'token') {
    updateAuthBadge('Token / Cookie Mode', true);
  } else if (tabId === 'sso') {
    updateAuthBadge('Interactive SSO Mode', true);
  } else if (tabId === 'sessions') {
    loadSavedSessions();
  }
}

function updateAuthBadge(text, isActive) {
  if (!authStatusBadge) return;
  authStatusBadge.textContent = text;
  authStatusBadge.classList.toggle('active', isActive);
  authSection.classList.toggle('authenticated', isActive);
}

async function launchSSOLogin() {
  let url = (authLoginUrl && authLoginUrl.value.trim()) || urlInput.value.trim();
  if (!url) {
    alert('Please enter an application or login URL first.');
    urlInput.focus();
    return;
  }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  btnLaunchSSO.disabled = true;
  ssoStatus.textContent = 'Launching browser... log in and click "Save Session" in the browser.';
  ssoStatus.style.color = 'var(--accent-primary)';

  try {
    const res = await fetch('/api/auth/interactive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to start interactive login');
    }

    const session = await res.json();
    selectedSessionId = session.id;
    ssoStatus.textContent = `✓ Session captured! (${session.cookiesCount} cookies)`;
    ssoStatus.style.color = 'var(--color-pass)';
    updateAuthBadge(`Authenticated (${session.domain})`, true);
    await loadSavedSessions();
  } catch (err) {
    ssoStatus.textContent = 'Login cancelled or failed: ' + err.message;
    ssoStatus.style.color = 'var(--color-fail)';
  } finally {
    btnLaunchSSO.disabled = false;
  }
}

async function testFormLogin() {
  const loginUrl = (authLoginUrl && authLoginUrl.value.trim()) || urlInput.value.trim();
  const username = authUsername ? authUsername.value.trim() : '';
  const password = authPassword ? authPassword.value : '';

  if (!loginUrl || !username || !password) {
    alert('Please provide URL, username, and password.');
    return;
  }

  btnTestFormLogin.disabled = true;
  formLoginStatus.textContent = 'Submitting form in background...';
  formLoginStatus.style.color = 'var(--accent-primary)';

  const userSel = document.getElementById('auth-user-selector')?.value.trim();
  const passSel = document.getElementById('auth-pass-selector')?.value.trim();
  const subSel = document.getElementById('auth-submit-selector')?.value.trim();
  const triggerSel = document.getElementById('auth-trigger-selector')?.value.trim();

  try {
    const res = await fetch('/api/auth/form', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loginUrl,
        username,
        password,
        usernameSelector: userSel || undefined,
        passwordSelector: passSel || undefined,
        submitSelector: subSel || undefined,
        triggerSelector: triggerSel || undefined
      })
    });

    const data = await res.json();
    if (!res.ok) {
      let html = `<div style="color: #f43f5e; font-weight: 600; margin-top: 6px;">⚠️ ${escapeHtml(data.error || 'Login failed')}</div>`;
      if (data.screenshotUrl) {
        html += `
          <div style="margin-top: 10px; background: rgba(0,0,0,0.35); padding: 12px; border-radius: 8px; border: 1px solid rgba(244,63,94,0.3); max-width: 500px;">
            <div style="font-size: 0.78rem; color: #94a3b8; margin-bottom: 6px;">
              📸 <strong>Page state when login halted:</strong> ${escapeHtml(data.pageTitle ? `"${data.pageTitle}"` : '')}
            </div>
            <a href="${data.screenshotUrl}" target="_blank" title="Click to view full image">
              <img src="${data.screenshotUrl}" alt="Login Screen" style="max-width: 100%; max-height: 240px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); display: block;" />
            </a>
          </div>
        `;
      }
      formLoginStatus.innerHTML = html;
      return;
    }

    selectedSessionId = data.id;
    formLoginStatus.innerHTML = `<span style="color: var(--color-pass); font-weight: 600;">✓ Logged in successfully! (${data.cookiesCount} cookies captured)</span>`;
    updateAuthBadge(`Authenticated (${username})`, true);
    await loadSavedSessions();
  } catch (err) {
    formLoginStatus.innerHTML = `<span style="color: var(--color-fail); font-weight: 600;">Error: ${escapeHtml(err.message)}</span>`;
  } finally {
    btnTestFormLogin.disabled = false;
  }
}

async function applyTokenAuth() {
  const rawInput = authTokenInput ? authTokenInput.value.trim() : '';
  if (!rawInput) {
    alert('Please paste a Bearer token, Cookie string, or storageState JSON.');
    return;
  }
  const currentUrl = (authLoginUrl && authLoginUrl.value.trim()) || urlInput.value.trim() || 'https://app.local';
  let data;

  try {
    data = JSON.parse(rawInput);
  } catch {
    const safeUrl = /^https?:\/\//i.test(currentUrl) ? currentUrl : 'https://' + currentUrl;
    const parsedUrl = new URL(safeUrl);
    if (/^bearer\s+/i.test(rawInput) || rawInput.startsWith('ey')) {
      const token = rawInput.replace(/^bearer\s+/i, '').trim();
      data = {
        cookies: [],
        origins: [{
          origin: parsedUrl.origin,
          localStorage: [
            { name: 'token', value: token },
            { name: 'access_token', value: token },
            { name: 'jwt', value: token },
            { name: 'auth', value: token },
            { name: 'id_token', value: token }
          ]
        }]
      };
    } else {
      const cookies = rawInput.split(';').map(c => {
        const [k, ...v] = c.trim().split('=');
        return {
          name: k,
          value: v.join('='),
          domain: parsedUrl.hostname,
          path: '/'
        };
      }).filter(c => c.name && c.value);

      data = { cookies, origins: [] };
    }
  }

  if (btnApplyToken) btnApplyToken.disabled = true;
  tokenStatus.textContent = 'Saving token profile...';
  tokenStatus.style.color = 'var(--accent-primary)';

  try {
    const res = await fetch('/api/auth/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data,
        name: `Token Profile (${new URL(/^https?:\/\//i.test(currentUrl) ? currentUrl : 'https://' + currentUrl).hostname})`,
        url: currentUrl
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save session');
    }

    const session = await res.json();
    selectedSessionId = session.id;
    tokenStatus.textContent = `✓ Token profile saved & selected! (${session.cookiesCount} cookies, ${session.originsCount} storage keys)`;
    tokenStatus.style.color = 'var(--color-pass)';
    updateAuthBadge(`Authenticated (${session.domain})`, true);
    await loadSavedSessions();
  } catch (err) {
    tokenStatus.textContent = 'Error: ' + err.message;
    tokenStatus.style.color = 'var(--color-fail)';
  } finally {
    if (btnApplyToken) btnApplyToken.disabled = false;
  }
}

if (btnApplyToken) btnApplyToken.addEventListener('click', applyTokenAuth);

async function loadSavedSessions() {
  try {
    const res = await fetch('/api/auth/sessions');
    if (!res.ok) return;
    savedSessions = await res.json();
    if (savedSessionsCount) savedSessionsCount.textContent = savedSessions.length;

    if (!savedSessionsList) return;

    if (savedSessions.length === 0) {
      savedSessionsList.innerHTML = '<p class="empty-state">No saved sessions yet. Use Interactive SSO or Form Login to create one.</p>';
      return;
    }

    savedSessionsList.innerHTML = savedSessions.map(session => {
      const isSelected = selectedSessionId === session.id;
      return `
        <div class="session-card ${isSelected ? 'selected' : ''}">
          <div class="session-info">
            <span class="session-name">${escapeHtml(session.name)}</span>
            <span class="session-details">
              Domain: <strong>${escapeHtml(session.domain)}</strong> • 
              Cookies: ${session.cookiesCount || 0} • 
              Saved: ${new Date(session.createdAt).toLocaleDateString()}
            </span>
          </div>
          <div class="session-actions">
            <button type="button" class="btn-select-session" onclick="selectSession('${session.id}')">
              ${isSelected ? '✓ Selected' : 'Select'}
            </button>
            <button type="button" class="btn-delete-session" onclick="deleteSession('${session.id}')" title="Delete session">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load saved sessions:', err);
  }
}

window.selectSession = function(id) {
  const session = savedSessions.find(s => s.id === id);
  if (!session) return;
  if (selectedSessionId === id) {
    selectedSessionId = null;
    updateAuthBadge('Public (No Auth)', false);
  } else {
    selectedSessionId = id;
    updateAuthBadge(`Authenticated (${session.domain})`, true);
  }
  loadSavedSessions();
};

window.deleteSession = async function(id) {
  if (!confirm('Are you sure you want to remove this saved session?')) return;
  try {
    await fetch(`/api/auth/sessions/${id}`, { method: 'DELETE' });
    if (selectedSessionId === id) {
      selectedSessionId = null;
      updateAuthBadge('Public (No Auth)', false);
    }
    await loadSavedSessions();
  } catch (err) {
    alert('Failed to delete session: ' + err.message);
  }
};

// ── Clean initial state on load ──
window.addEventListener('DOMContentLoaded', async () => {
  historyModal.hidden = true;
  if (resultsSection) resultsSection.hidden = true;
  if (urlInput) {
    urlInput.value = '';
    urlInput.focus();
  }

  // Load saved auth sessions
  loadSavedSessions();
});

// ═══════════════════════════════════════════════════════════════════
// ── ENTERPRISE E2E SCENARIOS & USER JOURNEYS (POST-LOGIN) ──
// ═══════════════════════════════════════════════════════════════════

// DOM References for Mode & Scenarios
const navModeAudit = document.getElementById('nav-mode-audit');
const navModeScenarios = document.getElementById('nav-mode-scenarios');
const viewAudit = document.getElementById('view-audit');
const viewScenarios = document.getElementById('view-scenarios');

const selectScenario = document.getElementById('select-scenario');
const btnNewScenario = document.getElementById('btn-new-scenario');
const btnDeleteScenario = document.getElementById('btn-delete-scenario');
const scenarioAuthSelect = document.getElementById('scenario-auth-select');
const scenarioBaseUrlInput = document.getElementById('scenario-base-url-input');
const btnRunScenario = document.getElementById('btn-run-scenario');
const btnExportScenarioJunit = document.getElementById('btn-export-scenario-junit');
const scenBadgeSteps = document.getElementById('scen-badge-steps');
const scenBadgeAuth = document.getElementById('scen-badge-auth');

const scenarioEditorDetails = document.getElementById('scenario-editor-details');
const scenarioJsonEditor = document.getElementById('scenario-json-editor');
const btnSaveScenario = document.getElementById('btn-save-scenario');
const btnFormatJson = document.getElementById('btn-format-json');
const scenarioSaveStatus = document.getElementById('scenario-save-status');

const scenarioResultsPanel = document.getElementById('scenario-results-panel');
const scenStatusTitle = document.getElementById('scen-status-title');
const scenStatusSubtitle = document.getElementById('scen-status-subtitle');
const scenMetricStatus = document.getElementById('scen-metric-status');
const scenMetricDuration = document.getElementById('scen-metric-duration');
const scenMetricPassed = document.getElementById('scen-metric-passed');
const scenProgressFill = document.getElementById('scen-progress-fill');
const scenarioStepsContainer = document.getElementById('scenario-steps-container');

// Lightbox modal DOM
const lightboxModal = document.getElementById('lightbox-modal');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxCaption = document.getElementById('lightbox-caption');
const btnCloseLightbox = document.getElementById('btn-close-lightbox');
const lightboxBackdrop = document.getElementById('lightbox-backdrop');

let currentScenarioRunId = null;
let currentScenarioEventSource = null;
let loadedScenarios = [];

// Mode Switcher
if (navModeAudit && navModeScenarios) {
  navModeAudit.addEventListener('click', () => {
    navModeAudit.classList.add('active');
    navModeScenarios.classList.remove('active');
    if (viewAudit) {
      viewAudit.hidden = false;
      viewAudit.classList.add('active');
    }
    if (viewScenarios) {
      viewScenarios.hidden = true;
      viewScenarios.classList.remove('active');
    }
  });

  navModeScenarios.addEventListener('click', () => {
    navModeScenarios.classList.add('active');
    navModeAudit.classList.remove('active');
    if (viewScenarios) {
      viewScenarios.hidden = false;
      viewScenarios.classList.add('active');
    }
    if (viewAudit) {
      viewAudit.hidden = true;
      viewAudit.classList.remove('active');
    }
    loadScenariosList();
    populateScenarioAuthDropdown();
  });
}

// Lightbox close handlers
if (btnCloseLightbox) btnCloseLightbox.addEventListener('click', () => lightboxModal.hidden = true);
if (lightboxBackdrop) lightboxBackdrop.addEventListener('click', () => lightboxModal.hidden = true);

window.openLightbox = function(url, caption) {
  if (!lightboxModal) return;
  lightboxImg.src = url;
  lightboxCaption.textContent = caption || '';
  lightboxModal.hidden = false;
};

// Populate Auth Profiles in Scenario Runner
function populateScenarioAuthDropdown() {
  if (!scenarioAuthSelect) return;
  const currentVal = scenarioAuthSelect.value;
  scenarioAuthSelect.innerHTML = '<option value="">None (Run Public / Unauthenticated)</option>';

  for (const s of savedSessions) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.name || s.domain} (${s.type || 'session'})`;
    scenarioAuthSelect.appendChild(opt);
  }

  if (currentVal && Array.from(scenarioAuthSelect.options).some(o => o.value === currentVal)) {
    scenarioAuthSelect.value = currentVal;
  }
}

// Load scenarios list from server
async function loadScenariosList() {
  if (!selectScenario) return;
  try {
    const res = await fetch('/api/scenarios');
    if (!res.ok) throw new Error('Failed to load scenarios');
    loadedScenarios = await res.json();

    selectScenario.innerHTML = '';
    if (loadedScenarios.length === 0) {
      selectScenario.innerHTML = '<option value="">No scenarios found (Click + New Journey)</option>';
      return;
    }

    for (const sc of loadedScenarios) {
      const opt = document.createElement('option');
      opt.value = sc.id;
      opt.textContent = `${sc.name} (${sc.stepsCount} steps)`;
      selectScenario.appendChild(opt);
    }

    // Load the first scenario by default
    selectScenarioScenario(loadedScenarios[0].id);
  } catch (err) {
    console.error('Error fetching scenarios:', err);
    selectScenario.innerHTML = `<option value="">Error: ${err.message}</option>`;
  }
}

async function selectScenarioScenario(id) {
  if (!id) return;
  try {
    const res = await fetch(`/api/scenarios/${id}`);
    if (!res.ok) throw new Error('Scenario not found');
    const scenario = await res.json();

    if (scenarioJsonEditor) {
      scenarioJsonEditor.value = JSON.stringify(scenario, null, 2);
    }
    if (scenarioBaseUrlInput) {
      scenarioBaseUrlInput.value = scenario.baseUrl || '';
    }
    if (scenBadgeSteps) {
      const count = Array.isArray(scenario.steps) ? scenario.steps.length : 0;
      scenBadgeSteps.textContent = `${count} Steps`;
    }
    if (scenBadgeAuth) {
      scenBadgeAuth.textContent = scenarioAuthSelect && scenarioAuthSelect.value ? 'Authenticated' : 'Public';
    }
  } catch (err) {
    console.error('Failed to load scenario details:', err);
  }
}

if (selectScenario) {
  selectScenario.addEventListener('change', () => {
    selectScenarioScenario(selectScenario.value);
  });
}

if (scenarioAuthSelect) {
  scenarioAuthSelect.addEventListener('change', () => {
    if (scenBadgeAuth) {
      scenBadgeAuth.textContent = scenarioAuthSelect.value ? 'Authenticated' : 'Public';
    }
  });
}

// + New Scenario template
if (btnNewScenario) {
  btnNewScenario.addEventListener('click', () => {
    const newTemplate = {
      id: `scenario_${Date.now()}`,
      name: "New Post-Login User Journey",
      description: "Automated business workflow verifying navigation, inputs, and state changes.",
      baseUrl: urlInput ? urlInput.value.trim() || "https://example.com" : "https://example.com",
      viewport: { width: 1440, height: 900 },
      variables: {
        itemTitle: "Audit Report {{TIMESTAMP}}"
      },
      steps: [
        {
          name: "Open Application",
          action: "navigate",
          url: "/",
          screenshot: true
        },
        {
          name: "Verify Navigation Loaded",
          assert: "assertVisible",
          selector: "body"
        }
      ]
    };

    if (scenarioJsonEditor) {
      scenarioJsonEditor.value = JSON.stringify(newTemplate, null, 2);
    }
    if (scenarioEditorDetails) {
      scenarioEditorDetails.open = true;
    }
    if (scenBadgeSteps) scenBadgeSteps.textContent = '2 Steps';
  });
}

// Format JSON in editor
if (btnFormatJson) {
  btnFormatJson.addEventListener('click', () => {
    try {
      const obj = JSON.parse(scenarioJsonEditor.value);
      scenarioJsonEditor.value = JSON.stringify(obj, null, 2);
    } catch (err) {
      alert('Invalid JSON syntax: ' + err.message);
    }
  });
}

// Save Scenario
if (btnSaveScenario) {
  btnSaveScenario.addEventListener('click', async () => {
    try {
      const scenario = JSON.parse(scenarioJsonEditor.value);
      scenarioSaveStatus.textContent = 'Saving...';
      scenarioSaveStatus.style.color = '#818cf8';

      const res = await fetch('/api/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scenario)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save scenario');
      }

      scenarioSaveStatus.textContent = 'Saved successfully!';
      scenarioSaveStatus.style.color = '#10b981';
      setTimeout(() => scenarioSaveStatus.textContent = '', 3000);

      await loadScenariosList();
      if (selectScenario) selectScenario.value = scenario.id;
    } catch (err) {
      scenarioSaveStatus.textContent = 'Error: ' + err.message;
      scenarioSaveStatus.style.color = '#ef4444';
    }
  });
}

// Delete Scenario
if (btnDeleteScenario) {
  btnDeleteScenario.addEventListener('click', async () => {
    const id = selectScenario.value;
    if (!id) return;
    if (!confirm('Are you sure you want to delete this scenario?')) return;

    try {
      const res = await fetch(`/api/scenarios/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete scenario');
      await loadScenariosList();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  });
}

// Run Scenario & Stream Steps
if (btnRunScenario) {
  btnRunScenario.addEventListener('click', async () => {
    let scenarioData;
    try {
      scenarioData = JSON.parse(scenarioJsonEditor.value);
    } catch (err) {
      alert('Invalid Scenario JSON: ' + err.message);
      if (scenarioEditorDetails) scenarioEditorDetails.open = true;
      return;
    }

    const authSessionId = scenarioAuthSelect ? scenarioAuthSelect.value : null;
    const baseUrlOverride = scenarioBaseUrlInput ? scenarioBaseUrlInput.value.trim() : null;

    // UI: Set running state
    btnRunScenario.querySelector('.btn-text').hidden = true;
    btnRunScenario.querySelector('.btn-loader').hidden = false;
    btnRunScenario.disabled = true;
    if (btnExportScenarioJunit) btnExportScenarioJunit.disabled = true;

    scenarioResultsPanel.hidden = false;
    scenarioStepsContainer.innerHTML = '';
    scenStatusTitle.textContent = `Running: ${scenarioData.name}`;
    scenStatusSubtitle.textContent = 'Executing user actions and assertions in headless browser...';
    scenMetricStatus.textContent = 'RUNNING';
    scenMetricStatus.className = 'metric-pill';
    scenMetricDuration.textContent = '0s';
    scenMetricPassed.textContent = `0/${scenarioData.steps.length} Passed`;
    scenProgressFill.style.width = '5%';

    const startTime = Date.now();
    const durationTimer = setInterval(() => {
      const sec = ((Date.now() - startTime) / 1000).toFixed(1);
      scenMetricDuration.textContent = `${sec}s`;
    }, 200);

    try {
      const res = await fetch('/api/scenarios/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenarioData,
          authSessionId,
          baseUrl: baseUrlOverride || scenarioData.baseUrl
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to start scenario run');
      }

      const { runId } = await res.json();
      currentScenarioRunId = runId;

      // Close previous SSE if any
      if (currentScenarioEventSource) currentScenarioEventSource.close();

      const evtSource = new EventSource(`/api/scenarios/run/${runId}/stream`);
      currentScenarioEventSource = evtSource;

      const totalSteps = scenarioData.steps.length;
      let executedCount = 0;
      let passedCount = 0;

      evtSource.onmessage = (event) => {
        const payload = JSON.parse(event.data);

        if (payload.type === 'step') {
          const step = payload.data;
          renderScenarioStepCard(step);

          executedCount = Math.max(executedCount, step.index);
          if (step.status === 'pass') passedCount++;
          const pct = Math.min(100, Math.round((executedCount / totalSteps) * 100));
          scenProgressFill.style.width = `${pct}%`;
          scenMetricPassed.textContent = `${passedCount}/${totalSteps} Passed`;
        }

        if (payload.type === 'complete' || payload.type === 'error') {
          clearInterval(durationTimer);
          evtSource.close();

          btnRunScenario.querySelector('.btn-text').hidden = false;
          btnRunScenario.querySelector('.btn-loader').hidden = true;
          btnRunScenario.disabled = false;

          const result = payload.data || {};
          const passed = result.passed || (payload.type === 'complete' && !result.error);

          scenProgressFill.style.width = '100%';
          scenMetricStatus.textContent = passed ? 'PASSED' : 'FAILED';
          scenMetricStatus.className = `metric-pill ${passed ? 'pass' : 'fail'}`;

          scenStatusTitle.textContent = passed ? '✓ Journey Succeeded' : '✗ Journey Failed';
          scenStatusSubtitle.textContent = passed
            ? `All ${result.totalSteps || totalSteps} steps passed smoothly in ${((result.duration || (Date.now() - startTime)) / 1000).toFixed(2)}s`
            : `Failed at step ${executedCount} with error. See failure details below.`;

          if (btnExportScenarioJunit) {
            btnExportScenarioJunit.disabled = false;
          }
        }
      };

      evtSource.onerror = () => {
        clearInterval(durationTimer);
        evtSource.close();
        btnRunScenario.querySelector('.btn-text').hidden = false;
        btnRunScenario.querySelector('.btn-loader').hidden = true;
        btnRunScenario.disabled = false;
      };

    } catch (err) {
      clearInterval(durationTimer);
      btnRunScenario.querySelector('.btn-text').hidden = false;
      btnRunScenario.querySelector('.btn-loader').hidden = true;
      btnRunScenario.disabled = false;
      alert('Scenario execution failed: ' + err.message);
    }
  });
}

// Export Scenario JUnit
if (btnExportScenarioJunit) {
  btnExportScenarioJunit.addEventListener('click', () => {
    if (currentScenarioRunId) {
      window.open(`/api/scenarios/run/${currentScenarioRunId}/junit`, '_blank');
    }
  });
}

// Render or update single step card
function renderScenarioStepCard(step) {
  let card = document.getElementById(`step-card-${step.index}`);
  if (!card) {
    card = document.createElement('div');
    card.id = `step-card-${step.index}`;
    card.className = `step-card ${step.status}`;
    scenarioStepsContainer.appendChild(card);
  } else {
    card.className = `step-card ${step.status}`;
  }

  const badgeText = step.status === 'running' ? '⋯ RUNNING' : step.status === 'pass' ? '✓ PASS' : '✗ FAIL';
  const durationText = step.duration ? `${step.duration}ms` : '';

  let detailHtml = '';
  if (step.action) {
    detailHtml += `<span><strong>Action:</strong> <code>${step.action}</code></span>`;
  }
  if (step.assert) {
    detailHtml += `<span><strong>Assertion:</strong> <code>${step.assert}</code></span>`;
  }
  if (step.details && step.details.selector) {
    detailHtml += `<span><strong>Target:</strong> <code>${step.details.selector}</code></span>`;
  }

  let shotHtml = '';
  if (step.screenshotUrl) {
    shotHtml = `<img src="${step.screenshotUrl}" alt="Step ${step.index}" class="step-thumb" onclick="openLightbox('${step.screenshotUrl}', '${escapeHtml(step.name)}')" title="Click to enlarge" />`;
  }

  let errorHtml = '';
  if (step.error) {
    errorHtml = `<div class="step-error-banner"><strong>Error:</strong> ${escapeHtml(step.error)}</div>`;
  }

  card.innerHTML = `
    <div class="step-header">
      <div class="step-header-left">
        <div class="step-num-badge">${step.index}</div>
        <div class="step-name">${escapeHtml(step.name)}</div>
      </div>
      <div class="step-header-right">
        <span class="step-duration">${durationText}</span>
        <span class="step-badge ${step.status}">${badgeText}</span>
      </div>
    </div>
    <div class="step-body">
      <div class="step-details">${detailHtml}</div>
      ${shotHtml}
    </div>
    ${errorHtml}
  `;
}
