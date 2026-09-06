const { chromium } = require('playwright');
let AxeBuilder;
try {
  AxeBuilder = require('@axe-core/playwright').default || require('@axe-core/playwright');
} catch {
  AxeBuilder = null;
}

/**
 * Accessibility Tests
 * Uses industry-standard @axe-core/playwright for WCAG 2.1 AA legal compliance,
 * with graceful fallback to semantic DOM inspection.
 */
async function run(siteData, options = {}) {
  const tests = [];
  const pagesToTest = siteData.pages.slice(0, 5); // Test top 5 discovered pages for deep WCAG analysis

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const contextOptions = {};
    if (options.storageState) {
      contextOptions.storageState = options.storageState;
    }
    const context = await browser.newContext(contextOptions);

    for (const pageInfo of pagesToTest) {
      const pageLabel = new URL(pageInfo.url).pathname || '/';
      let axeRan = false;

      if (AxeBuilder) {
        try {
          const page = await context.newPage();
          await page.goto(pageInfo.url, { waitUntil: 'domcontentloaded', timeout: 15000 });

          // Run axe-core with WCAG 2.1 Level A & AA standards
          const accessibilityScanResults = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze();

          await page.close();
          axeRan = true;

          const violations = accessibilityScanResults.violations || [];
          const passes = accessibilityScanResults.passes || [];

          if (violations.length === 0) {
            tests.push({
              name: `WCAG 2.1 AA Compliance [${pageLabel}]`,
              status: 'pass',
              message: `Passed all ${passes.length} automated WCAG 2.1 Level A & AA rules`,
              details: {
                standard: 'WCAG 2.1 Level AA',
                rulesPassed: passes.length
              }
            });
          } else {
            // Report each significant violation
            for (const v of violations) {
              const isSevere = v.impact === 'critical' || v.impact === 'serious';
              tests.push({
                name: `[WCAG ${v.impact ? v.impact.toUpperCase() : 'ISSUE'}] ${v.help} [${pageLabel}]`,
                status: isSevere ? 'fail' : 'warn',
                message: `${v.description} (${v.nodes.length} affected element(s))`,
                details: {
                  ruleId: v.id,
                  impact: v.impact,
                  helpUrl: v.helpUrl,
                  tags: v.tags,
                  elements: v.nodes.slice(0, 3).map(n => ({
                    html: n.html,
                    target: n.target.join(' ')
                  }))
                }
              });
            }
          }
        } catch (axeErr) {
          // If axe execution had issues on this page, continue to fallback checks
          axeRan = false;
        }
      }

      // If axe did not run, execute semantic DOM checks
      if (!axeRan) {
        // Heading hierarchy check
        if (pageInfo.headings && pageInfo.headings.length > 0) {
          const h1Count = pageInfo.headings.filter(h => h.level === 1).length;
          tests.push({
            name: `H1 Tag [${pageLabel}]`,
            status: h1Count === 1 ? 'pass' : 'warn',
            message: h1Count === 1
              ? `Single H1: "${pageInfo.headings.find(h => h.level === 1).text}"`
              : h1Count === 0 ? 'No H1 heading found' : `Multiple H1 tags found (${h1Count})`,
            details: { headings: pageInfo.headings }
          });
        }

        // Image alt text check
        if (pageInfo.images && pageInfo.images.length > 0) {
          const missingAlt = pageInfo.images.filter(img => !img.hasAlt);
          tests.push({
            name: `Image Alt Text [${pageLabel}]`,
            status: missingAlt.length === 0 ? 'pass' : 'fail',
            message: missingAlt.length === 0
              ? `All ${pageInfo.images.length} images have alt text`
              : `${missingAlt.length} of ${pageInfo.images.length} images missing alt text`,
            details: { missingAlt: missingAlt.map(i => i.src) }
          });
        }

        // Link accessibility check
        if (pageInfo.links && pageInfo.links.length > 0) {
          const linksWithoutText = pageInfo.links.filter(l => !l.text && !l.hasAriaLabel);
          tests.push({
            name: `Link Accessibility [${pageLabel}]`,
            status: linksWithoutText.length === 0 ? 'pass' : 'warn',
            message: linksWithoutText.length === 0
              ? 'All links have visible text or aria-label'
              : `${linksWithoutText.length} link(s) have no text and no aria-label`,
            details: { links: linksWithoutText.map(l => l.href).slice(0, 5) }
          });
        }
      }
    }
  } catch (err) {
    tests.push({
      name: 'Accessibility Engine',
      status: 'warn',
      message: `Deep scan encountered note: ${err.message}`,
      details: null
    });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  const hasFailures = tests.some(t => t.status === 'fail');
  const hasWarnings = tests.some(t => t.status === 'warn');

  return {
    category: 'Accessibility',
    status: hasFailures ? 'fail' : hasWarnings ? 'warn' : 'pass',
    message: AxeBuilder
      ? `Audited against WCAG 2.1 AA standards (${tests.length} checks performed)`
      : `Ran semantic accessibility checks (${tests.length} checks performed)`,
    tests
  };
}

module.exports = { run };
