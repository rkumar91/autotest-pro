const { chromium } = require('playwright');

/**
 * Console Error Capture Tests
 * Navigates to each page and captures browser console errors and warnings.
 */
async function run(siteData, options = {}) {
  const tests = [];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  try {
    for (const pageData of siteData.pages) {
      const pageLabel = new URL(pageData.url).pathname || '/';
      const page = await context.newPage();

      const consoleErrors = [];
      const consoleWarnings = [];
      const jsErrors = [];

      // Listen for console messages
      page.on('console', msg => {
        const type = msg.type();
        const text = msg.text();
        if (type === 'error') {
          consoleErrors.push(text);
        } else if (type === 'warning') {
          consoleWarnings.push(text);
        }
      });

      // Listen for page errors (uncaught exceptions)
      page.on('pageerror', error => {
        jsErrors.push(error.message);
      });

      try {
        await page.goto(pageData.url, {
          waitUntil: 'networkidle',
          timeout: 20000
        });

        // Wait a bit to catch late errors
        await page.waitForTimeout(2000);
      } catch (err) {
        // Navigation error itself is captured elsewhere
      }

      // Console errors
      tests.push({
        name: `Console Errors [${pageLabel}]`,
        status: consoleErrors.length === 0 ? 'pass' : 'fail',
        message: consoleErrors.length === 0
          ? 'No console errors'
          : `${consoleErrors.length} console error(s)`,
        details: { errors: consoleErrors.slice(0, 20) }
      });

      // JavaScript errors
      tests.push({
        name: `JavaScript Errors [${pageLabel}]`,
        status: jsErrors.length === 0 ? 'pass' : 'fail',
        message: jsErrors.length === 0
          ? 'No uncaught JavaScript errors'
          : `${jsErrors.length} uncaught error(s)`,
        details: { errors: jsErrors.slice(0, 20) }
      });

      // Console warnings
      tests.push({
        name: `Console Warnings [${pageLabel}]`,
        status: consoleWarnings.length === 0 ? 'pass' : 'info',
        message: consoleWarnings.length === 0
          ? 'No console warnings'
          : `${consoleWarnings.length} warning(s)`,
        details: { warnings: consoleWarnings.slice(0, 20) }
      });

      await page.close();
    }
  } finally {
    await browser.close();
  }

  return {
    category: 'Console Errors',
    status: tests.some(t => t.status === 'fail') ? 'fail' : 'pass',
    message: `Checked console output across ${siteData.pages.length} page(s)`,
    tests
  };
}

module.exports = { run };
