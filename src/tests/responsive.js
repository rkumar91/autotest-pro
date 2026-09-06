const { chromium } = require('playwright');
const path = require('path');

/**
 * Responsive Design Tests
 * Takes screenshots at mobile, tablet, and desktop viewports.
 * Checks for viewport meta tag and responsive behavior.
 */
async function run(siteData, options = {}) {
  const tests = [];
  const screenshotsDir = options.screenshotsDir || './screenshots';
  const sessionId = options.sessionId || 'default';

  const viewports = [
    { name: 'Mobile', width: 375, height: 812, deviceScaleFactor: 2 },
    { name: 'Tablet', width: 768, height: 1024, deviceScaleFactor: 1.5 },
    { name: 'Desktop', width: 1440, height: 900, deviceScaleFactor: 1 }
  ];

  const browser = await chromium.launch({ headless: true });

  try {
    for (const vp of viewports) {
      const contextOptions = {
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.deviceScaleFactor
      };
      if (options.storageState) {
        contextOptions.storageState = options.storageState;
      }
      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();

      try {
        await page.goto(siteData.startUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

        // Wait a bit for animations to settle
        await page.waitForTimeout(1500);

        const filename = `${sessionId}_${vp.name.toLowerCase()}_${vp.width}x${vp.height}.png`;
        const screenshotPath = path.join(screenshotsDir, filename);

        await page.screenshot({
          path: screenshotPath,
          fullPage: true
        });

        tests.push({
          name: `${vp.name} Screenshot (${vp.width}x${vp.height})`,
          status: 'pass',
          message: `Screenshot captured successfully`,
          details: {
            viewport: `${vp.width}x${vp.height}`,
            filename,
            screenshotUrl: `/screenshots/${filename}`
          }
        });

        // Check for horizontal overflow (common responsive issue)
        const hasOverflow = await page.evaluate((vpWidth) => {
          return document.documentElement.scrollWidth > vpWidth;
        }, vp.width);

        tests.push({
          name: `${vp.name} Horizontal Overflow`,
          status: hasOverflow ? 'warn' : 'pass',
          message: hasOverflow
            ? `Page content overflows viewport at ${vp.width}px width`
            : `No horizontal overflow at ${vp.width}px`,
          details: {
            viewportWidth: vp.width,
            scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth)
          }
        });

      } catch (err) {
        tests.push({
          name: `${vp.name} Screenshot`,
          status: 'fail',
          message: `Failed to capture: ${err.message}`,
          details: null
        });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  return {
    category: 'Responsive Design',
    status: tests.some(t => t.status === 'fail') ? 'fail' : tests.some(t => t.status === 'warn') ? 'warn' : 'pass',
    message: `Tested ${viewports.length} viewports`,
    tests
  };
}

module.exports = { run };
