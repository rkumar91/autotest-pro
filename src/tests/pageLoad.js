/**
 * Page Load & Performance Tests
 * Checks load times, status codes, page titles, and basic performance metrics.
 */
async function run(siteData, options = {}) {
  const tests = [];

  for (const page of siteData.pages) {
    // Status code check
    tests.push({
      name: `Status Code: ${page.url}`,
      status: page.status >= 200 && page.status < 400 ? 'pass' : 'fail',
      message: `HTTP ${page.status}`,
      details: { url: page.url, statusCode: page.status }
    });

    // Page title check
    tests.push({
      name: `Page Title: ${page.url}`,
      status: page.title && page.title.trim().length > 0 ? 'pass' : 'warn',
      message: page.title ? `"${page.title}"` : 'No page title found',
      details: { title: page.title }
    });

    // Load time check
    let loadStatus = 'pass';
    let loadMessage = `${page.loadTime}ms`;
    if (page.loadTime > 5000) {
      loadStatus = 'fail';
      loadMessage += ' (Very Slow — over 5s)';
    } else if (page.loadTime > 3000) {
      loadStatus = 'warn';
      loadMessage += ' (Slow — over 3s)';
    } else if (page.loadTime > 1500) {
      loadStatus = 'warn';
      loadMessage += ' (Could be faster)';
    } else {
      loadMessage += ' (Good)';
    }

    tests.push({
      name: `Load Time: ${page.url}`,
      status: loadStatus,
      message: loadMessage,
      details: { loadTime: page.loadTime, url: page.url }
    });

    // Check for errors during page load
    if (page.errors && page.errors.length > 0) {
      tests.push({
        name: `Page Load Errors: ${page.url}`,
        status: 'fail',
        message: `${page.errors.length} error(s) during page load`,
        details: { errors: page.errors }
      });
    }
  }

  return {
    category: 'Page Load & Performance',
    status: tests.some(t => t.status === 'fail') ? 'fail' : tests.some(t => t.status === 'warn') ? 'warn' : 'pass',
    message: `Tested ${siteData.pages.length} page(s)`,
    tests
  };
}

module.exports = { run };
