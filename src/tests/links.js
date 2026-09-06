const { chromium } = require('playwright');

/**
 * Link Validation Tests
 * Checks all discovered links for broken links (4xx/5xx),
 * validates internal vs external links.
 */
async function run(siteData, options = {}) {
  const tests = [];
  const checkedUrls = new Map(); // Cache results to avoid re-checking

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'AutoTest-Pro/1.0 (Link Checker)'
  });
  const page = await context.newPage();

  try {
    for (const pageData of siteData.pages) {
      const pageLabel = new URL(pageData.url).pathname || '/';
      const internalLinks = [];
      const externalLinks = [];
      const brokenLinks = [];

      if (!pageData.links || pageData.links.length === 0) {
        tests.push({
          name: `Links [${pageLabel}]`,
          status: 'info',
          message: 'No links found on this page',
          details: null
        });
        continue;
      }

      // Categorize links
      for (const link of pageData.links) {
        if (link.isInternal) {
          internalLinks.push(link);
        } else {
          externalLinks.push(link);
        }
      }

      // Check a sample of links (limit to avoid excessive requests)
      const linksToCheck = [...internalLinks.slice(0, 15), ...externalLinks.slice(0, 10)];
      
      for (const link of linksToCheck) {
        if (!link.href || link.href.startsWith('javascript:') || link.href.startsWith('mailto:') || link.href.startsWith('tel:')) {
          continue;
        }

        if (checkedUrls.has(link.href)) {
          const cached = checkedUrls.get(link.href);
          if (cached.status >= 400) {
            brokenLinks.push({ ...link, statusCode: cached.status });
          }
          continue;
        }

        try {
          const response = await page.goto(link.href, {
            waitUntil: 'domcontentloaded',
            timeout: 10000
          });
          const status = response ? response.status() : 0;
          checkedUrls.set(link.href, { status });

          if (status >= 400) {
            brokenLinks.push({ ...link, statusCode: status });
          }
        } catch (err) {
          checkedUrls.set(link.href, { status: 0, error: err.message });
          brokenLinks.push({ ...link, statusCode: 0, error: err.message });
        }
      }

      // Report results
      tests.push({
        name: `Internal Links [${pageLabel}]`,
        status: 'info',
        message: `${internalLinks.length} internal link(s) found`,
        details: { count: internalLinks.length }
      });

      tests.push({
        name: `External Links [${pageLabel}]`,
        status: 'info',
        message: `${externalLinks.length} external link(s) found`,
        details: { count: externalLinks.length }
      });

      tests.push({
        name: `Broken Links [${pageLabel}]`,
        status: brokenLinks.length === 0 ? 'pass' : 'fail',
        message: brokenLinks.length === 0
          ? `No broken links found (checked ${linksToCheck.length})`
          : `${brokenLinks.length} broken link(s) detected`,
        details: {
          broken: brokenLinks.map(l => ({
            href: l.href,
            text: l.text,
            statusCode: l.statusCode,
            error: l.error
          }))
        }
      });
    }
  } finally {
    await browser.close();
  }

  return {
    category: 'Links',
    status: tests.some(t => t.status === 'fail') ? 'fail' : 'pass',
    message: `Checked links across ${siteData.pages.length} page(s)`,
    tests
  };
}

module.exports = { run };
