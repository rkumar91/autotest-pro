const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const authDir = path.join(__dirname, '..', 'auth');
if (!fs.existsSync(authDir)) {
  fs.mkdirSync(authDir, { recursive: true });
}

const sessionsMetaFile = path.join(authDir, 'sessions.json');

function loadSessionsMeta() {
  try {
    if (fs.existsSync(sessionsMetaFile)) {
      return JSON.parse(fs.readFileSync(sessionsMetaFile, 'utf8'));
    }
  } catch (err) {
    console.error('Failed to load sessions metadata:', err);
  }
  return [];
}

function saveSessionsMeta(list) {
  try {
    fs.writeFileSync(sessionsMetaFile, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save sessions metadata:', err);
  }
}

function getSessionFilePath(id) {
  const filename = id.startsWith('session_') ? `${id}.json` : `session_${id}.json`;
  return path.join(authDir, filename);
}

/**
 * Lists all saved local auth sessions
 */
function listSavedSessions() {
  const meta = loadSessionsMeta();
  return meta.filter(item => {
    const filePath = getSessionFilePath(item.id);
    return fs.existsSync(filePath);
  });
}

/**
 * Deletes a saved auth session
 */
function deleteSavedSession(id) {
  const filePath = getSessionFilePath(id);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  const meta = loadSessionsMeta().filter(m => m.id !== id);
  saveSessionsMeta(meta);
  return true;
}

/**
 * Resolves the full file path for a session ID
 */
function getStorageStatePath(sessionId) {
  if (!sessionId) return null;
  const filePath = getSessionFilePath(sessionId);
  return fs.existsSync(filePath) ? filePath : null;
}

/**
 * Imports raw storageState JSON (e.g. from Playwright, cookie export, or manual paste)
 */
function importStorageState(data, options = {}) {
  const id = `session_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const domain = options.domain || (options.url ? new URL(options.url).hostname : 'custom');
  const name = options.name || `Session (${domain})`;

  const filePath = getSessionFilePath(id);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');

  const cookiesCount = (data.cookies && data.cookies.length) || 0;
  const originsCount = (data.origins && data.origins.length) || 0;

  const sessionInfo = {
    id,
    name,
    domain,
    type: 'imported',
    createdAt: new Date().toISOString(),
    cookiesCount,
    originsCount,
    filePath
  };

  const meta = loadSessionsMeta();
  meta.unshift(sessionInfo);
  saveSessionsMeta(meta);

  return sessionInfo;
}

/**
 * Launches an interactive (headed) Chromium window for user to log in manually.
 * Supports Microsoft Entra ID, Google, Okta, MFA/2FA, OTP, and Captchas.
 * Automatically monitors for completion or user closing the browser.
 */
async function startInteractiveLogin(url, options = {}) {
  const parsedUrl = new URL(url);
  const domain = parsedUrl.hostname;
  const id = `session_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const filePath = getSessionFilePath(id);

  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized']
  });

  const context = await browser.newContext({
    viewport: null, // Full screen
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  return new Promise(async (resolve, reject) => {
    let isSaved = false;

    async function finishLogin() {
      if (isSaved) return;
      isSaved = true;

      try {
        await context.storageState({ path: filePath });
        const rawState = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const cookiesCount = (rawState.cookies && rawState.cookies.length) || 0;
        const originsCount = (rawState.origins && rawState.origins.length) || 0;

        await browser.close().catch(() => {});

        const sessionInfo = {
          id,
          name: options.name || `SSO Session (${domain})`,
          domain,
          type: 'interactive_sso',
          createdAt: new Date().toISOString(),
          cookiesCount,
          originsCount,
          filePath
        };

        const meta = loadSessionsMeta();
        meta.unshift(sessionInfo);
        saveSessionsMeta(meta);

        resolve(sessionInfo);
      } catch (err) {
        reject(err);
      }
    }

    // If user closes the browser manually, capture session immediately
    browser.on('disconnected', async () => {
      if (!isSaved) {
        await finishLogin();
      }
    });

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

      // Expose a helper to let the user click a floating "Save Session & Done" button
      await page.exposeFunction('__autotest_finish_login', async () => {
        await finishLogin();
      });

      // Inject floating helper overlay in the page
      await page.evaluate(() => {
        const overlay = document.createElement('div');
        overlay.id = '__autotest_overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '12px';
        overlay.style.right = '12px';
        overlay.style.zIndex = '99999999';
        overlay.style.background = 'rgba(18, 18, 30, 0.92)';
        overlay.style.color = '#ffffff';
        overlay.style.padding = '12px 18px';
        overlay.style.borderRadius = '12px';
        overlay.style.boxShadow = '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.5)';
        overlay.style.fontFamily = '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif';
        overlay.style.fontSize = '13px';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.gap = '12px';

        overlay.innerHTML = `
          <span>🧪 <strong>AutoTest Pro:</strong> Complete your login / MFA below.</span>
          <button id="__btn_save_session" style="
            background: linear-gradient(135deg, #6366f1, #a855f7);
            color: #fff;
            border: none;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
            font-size: 13px;
          ">Save Session &amp; Done &check;</button>
        `;

        document.body.appendChild(overlay);

        document.getElementById('__btn_save_session').addEventListener('click', () => {
          overlay.innerHTML = '<span>Saving session... closing browser...</span>';
          window.__autotest_finish_login();
        });
      });

      // Timeout safety: 10 minutes for complex SSO / MFA
      setTimeout(() => {
        if (!isSaved) {
          finishLogin();
        }
      }, 600000);

    } catch (err) {
      if (!isSaved) {
        await browser.close().catch(() => {});
        reject(err);
      }
    }
  });
}

/**
 * Automates standard username & password login forms
 */
/**
 * Automates standard and multi-step username & password login forms (including Microsoft Entra ID).
 */
async function performFormLogin(loginUrl, credentials = {}) {
  const {
    username,
    password,
    usernameSelector,
    passwordSelector,
    submitSelector,
    triggerSelector,
    name
  } = credentials;

  if (!username || !password) {
    throw new Error('Username and password are required for form authentication');
  }

  const parsedUrl = new URL(loginUrl);
  const domain = parsedUrl.hostname;
  const id = `session_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const filePath = getSessionFilePath(id);

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'] // Avoid simple bot detection
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();

  try {
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

    // Helper: find visible password element
    const findVisiblePassword = async () => {
      const candidates = passwordSelector ? [passwordSelector] : [
        '#i0118', // Microsoft Entra ID password
        'input[name="passwd"]',
        'input[type="password"]',
        'input[name*="password" i]',
        'input[name*="pass" i]',
        'input[id*="password" i]',
        'input[id*="pass" i]'
      ];
      for (const sel of candidates) {
        const el = await page.$(sel).catch(() => null);
        if (el && await el.isVisible().catch(() => false)) {
          return sel;
        }
      }
      return null;
    };

    let passField = await findVisiblePassword();

    // Step A: If password is not initially visible, check if we need to trigger a login modal or click a login button
    if (!passField) {
      const modalTriggers = triggerSelector ? [triggerSelector] : [
        'button:has-text("Login / Register")',
        'button:has-text("Login")',
        'a:has-text("Login")',
        'button:has-text("Sign In")',
        'a:has-text("Sign In")',
        'button:has-text("Log In")',
        'a:has-text("Log In")',
        'button:has-text("Sign in")',
        'a:has-text("Sign in")',
        'button:has-text("Log in")',
        'a:has-text("Log in")',
        '[data-testid*="login" i]',
        '[data-testid*="signin" i]',
        '[aria-label*="login" i]',
        '[aria-label*="sign in" i]'
      ];

      for (const triggerSel of modalTriggers) {
        const btn = await page.$(triggerSel).catch(() => null);
        if (btn && await btn.isVisible().catch(() => false)) {
          console.log(`[Auth] Auto-clicking login modal trigger: ${triggerSel}`);
          await btn.click().catch(() => {});
          await page.waitForTimeout(1500);
          break;
        }
      }

      // Re-check after clicking trigger
      passField = await findVisiblePassword();
    }

    // Step B: Resolve username & password inputs
    if (passField) {
      // ── Single-screen or Modal Form Flow ──
      // Scoped resolution: find username/email and submit button within the SAME form/modal container as the password field
      let userFieldHandle = null;

      if (usernameSelector) {
        const directUser = await page.$(usernameSelector).catch(() => null);
        if (directUser && await directUser.isVisible().catch(() => false)) {
          userFieldHandle = directUser;
        }
      }

      if (!userFieldHandle) {
        // Evaluate in DOM to find closest form/modal container and get its email/username input
        userFieldHandle = await page.evaluateHandle(() => {
          const pass = document.querySelector('input[type="password"], #i0118, input[name="passwd"]');
          if (!pass) return null;
          const container = pass.closest('form') || pass.closest('.modal') || pass.closest('[role="dialog"]') || pass.parentElement.parentElement;
          return container ? container.querySelector('input[type="email"], input[placeholder*="email" i], input[name*="email" i], input[name*="user" i], input[name*="login" i], input[type="text"]') : null;
        });

        const asEl = userFieldHandle ? userFieldHandle.asElement() : null;
        if (!asEl) {
          // Fallback to top-level candidates
          const topSelectors = ['#i0116', 'input[type="email"]:visible', 'input[placeholder*="email" i]:visible', 'input[name="username"]:visible', 'input[type="text"]:visible'];
          for (const s of topSelectors) {
            const el = await page.$(s).catch(() => null);
            if (el && await el.isVisible().catch(() => false)) {
              userFieldHandle = el;
              break;
            }
          }
        }
      }

      const emailEl = userFieldHandle ? (userFieldHandle.asElement ? userFieldHandle.asElement() : userFieldHandle) : null;
      if (emailEl) {
        await emailEl.click().catch(() => {});
        await emailEl.fill(username);
      } else {
        await page.fill('input[type="email"], input[type="text"]', username);
      }
      await page.waitForTimeout(300);

      // Fill password
      await page.click(passField);
      await page.fill(passField, password);
      await page.waitForTimeout(400);

      // Resolve submit button inside same container
      let clickedSubmit = false;
      if (submitSelector) {
        const customSub = await page.$(submitSelector).catch(() => null);
        if (customSub && await customSub.isVisible().catch(() => false)) {
          await customSub.click();
          clickedSubmit = true;
        }
      }

      if (!clickedSubmit) {
        const modalSubmitHandle = await page.evaluateHandle(() => {
          const pass = document.querySelector('input[type="password"], #i0118, input[name="passwd"]');
          if (!pass) return null;
          const container = pass.closest('form') || pass.closest('.modal') || pass.closest('[role="dialog"]') || pass.parentElement.parentElement;
          if (!container) return null;
          // Prefer submit button or button with login text
          const btns = Array.from(container.querySelectorAll('button, input[type="submit"]'));
          const loginBtn = btns.find(b => /login|sign in|log in|submit/i.test(b.innerText || b.value || ''));
          return loginBtn || container.querySelector('button[type="submit"], input[type="submit"]') || btns[0] || null;
        });

        const subEl = modalSubmitHandle ? modalSubmitHandle.asElement() : null;
        if (subEl) {
          await subEl.click().catch(() => {});
          clickedSubmit = true;
        }
      }

      if (!clickedSubmit) {
        // Fallback to pressing Enter on password field
        await page.press(passField, 'Enter');
      }

    } else {
      // ── Multi-Step Form Flow (e.g. Microsoft Entra ID / Google SSO screen 1) ──
      const userSelectors = usernameSelector ? [usernameSelector] : [
        '#i0116', // Microsoft Entra ID email
        'input[name="loginfmt"]', // Microsoft Entra ID
        'input[type="email"]',
        'input[name*="user" i]',
        'input[name*="email" i]',
        'input[name*="login" i]',
        'input[id*="user" i]',
        'input[id*="email" i]',
        'input[name="username"]',
        'input[type="text"]'
      ];

      let userField = null;
      for (const sel of userSelectors) {
        if (await page.isVisible(sel).catch(() => false)) {
          userField = sel;
          break;
        }
      }

      if (!userField) {
        userField = userSelectors[0];
        await page.waitForSelector(userField, { timeout: 10000 });
      }

      // Fill username
      await page.click(userField);
      await page.fill(userField, username);
      await page.waitForTimeout(500);

      // Look for Next / Continue button
      const nextSelectors = submitSelector ? [submitSelector] : [
        '#idSIButton9', // Microsoft Entra ID Next
        'input[value="Next"]',
        'input[type="submit"]',
        'button[type="submit"]',
        'button:has-text("Next")',
        'button:has-text("Continue")',
        '.ext-primary',
        'button[id*="next" i]'
      ];

      let nextBtn = null;
      for (const sel of nextSelectors) {
        if (await page.isVisible(sel).catch(() => false)) {
          nextBtn = sel;
          break;
        }
      }

      if (nextBtn) {
        await page.click(nextBtn);
      } else {
        await page.press(userField, 'Enter');
      }

      // Wait up to 15 seconds for password field to appear on screen 2
      for (let i = 0; i < 15; i++) {
        await page.waitForTimeout(1000);
        passField = await findVisiblePassword();
        if (passField) break;
      }

      if (!passField) {
        throw new Error(`Password field not found. Target URL may require SSO/MFA, a custom selector, or rendered a different screen.`);
      }

      // Fill password
      await page.click(passField);
      await page.fill(passField, password);
      await page.waitForTimeout(500);

      // Multi-step screen 2 submit (e.g. Entra ID Sign in)
      const finalSubmitSelectors = submitSelector ? [submitSelector] : [
        '#idSIButton9',
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Sign in")',
        'button:has-text("Log in")',
        'button:has-text("Login")'
      ];

      let finalBtn = null;
      for (const sel of finalSubmitSelectors) {
        if (await page.isVisible(sel).catch(() => false)) {
          finalBtn = sel;
          break;
        }
      }

      if (finalBtn) {
        await page.click(finalBtn);
      } else {
        await page.press(passField, 'Enter');
      }
    }

    // Wait for redirect or network idle
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Handle Microsoft Entra ID "Stay signed in?" screen if present
    const staySignedInBtn = '#idSIButton9, input[value="Yes"], button:has-text("Yes"), #idBtn_Back';
    if (await page.isVisible(staySignedInBtn).catch(() => false)) {
      await page.click(staySignedInBtn).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    }

    // Capture storageState
    await context.storageState({ path: filePath });
    const rawState = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const cookiesCount = (rawState.cookies && rawState.cookies.length) || 0;
    const originsCount = (rawState.origins && rawState.origins.length) || 0;

    await browser.close();

    const sessionInfo = {
      id,
      name: name || `Login Profile (${username} @ ${domain})`,
      domain,
      type: 'form_credentials',
      createdAt: new Date().toISOString(),
      cookiesCount,
      originsCount,
      filePath
    };

    const meta = loadSessionsMeta();
    meta.unshift(sessionInfo);
    saveSessionsMeta(meta);

    return sessionInfo;

  } catch (err) {
    // Capture failure screenshot for instant diagnosis
    let failureScreenshotUrl = null;
    let pageTitle = '';
    let currentUrl = '';
    try {
      const screenshotsDir = path.join(__dirname, '..', 'screenshots');
      if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
      const filename = `login_fail_${Date.now()}.png`;
      const screenshotPath = path.join(screenshotsDir, filename);
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
      failureScreenshotUrl = `/screenshots/${filename}`;
      pageTitle = await page.title().catch(() => '');
      currentUrl = page.url();
    } catch (e) {}

    await browser.close().catch(() => {});

    const error = new Error(`Form login failed: ${err.message}`);
    error.screenshotUrl = failureScreenshotUrl;
    error.pageTitle = pageTitle;
    error.currentUrl = currentUrl;
    throw error;
  }
}

module.exports = {
  authDir,
  listSavedSessions,
  deleteSavedSession,
  getStorageStatePath,
  importStorageState,
  startInteractiveLogin,
  performFormLogin
};
