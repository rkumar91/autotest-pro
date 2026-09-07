const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function recordDemo() {
  const recordingsDir = path.join(__dirname, '..', 'recordings');
  if (!fs.existsSync(recordingsDir)) {
    fs.mkdirSync(recordingsDir, { recursive: true });
  }

  console.log('🚀 Launching automated 1080p recording session...');

  const browser = await chromium.launch({
    headless: false // Show browser so it renders with full GPU acceleration
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: recordingsDir,
      size: { width: 1920, height: 1080 }
    }
  });

  const page = await context.newPage();

  try {
    // ── Scene 1: Dashboard Home (0:00 - 0:10) ──
    console.log('Scene 1: Loading clean dashboard...');
    await page.goto('http://localhost:3847');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // ── Scene 2: Entering URL & Starting Test (0:10 - 0:40) ──
    console.log('Scene 2: Entering target URL...');
    const urlInput = page.locator('#url-input');
    await urlInput.click();
    await page.waitForTimeout(1000);
    await urlInput.pressSequentially('https://example.com', { delay: 100 });
    await page.waitForTimeout(1000);

    console.log('Clicking Start Testing...');
    await page.click('#btn-start');

    // Wait for audit to complete (watch progress bar)
    console.log('Waiting for live audit to finish...');
    await page.waitForSelector('#results-section:not([hidden])', { timeout: 45000 });
    await page.waitForTimeout(4000);

    // ── Scene 3: Inspecting Health Score & Reports (0:40 - 0:55) ──
    console.log('Scene 3: Scrolling through results...');
    await page.evaluate(() => window.scrollBy({ top: 350, behavior: 'smooth' }));
    await page.waitForTimeout(3000);

    await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
    await page.waitForTimeout(3000);

    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.waitForTimeout(2000);

    // ── Scene 4: GitHub Repository & README (0:55 - 1:15) ──
    console.log('Scene 4: Visiting GitHub repository...');
    await page.goto('https://github.com/rkumar91/autotest-pro');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Scroll down README
    await page.evaluate(() => window.scrollBy({ top: 500, behavior: 'smooth' }));
    await page.waitForTimeout(3000);

    await page.evaluate(() => window.scrollBy({ top: 600, behavior: 'smooth' }));
    await page.waitForTimeout(3000);

    console.log('✅ Demo recording completed successfully!');
  } catch (err) {
    console.error('Error during recording:', err);
  } finally {
    const video = page.video();
    await page.close();
    await context.close();
    await browser.close();

    if (video) {
      const videoPath = await video.path();
      console.log(`Video saved at: ${videoPath}`);
      return videoPath;
    }
  }
}

recordDemo();
