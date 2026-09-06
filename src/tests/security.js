const { chromium } = require('playwright');

/**
 * Security Headers Tests
 * Checks HTTP response headers for security best practices:
 * CSP, X-Frame-Options, HSTS, X-Content-Type-Options, etc.
 */
async function run(siteData, options = {}) {
  const tests = [];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const response = await page.goto(siteData.startUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });

    if (!response) {
      tests.push({
        name: 'Security Headers',
        status: 'fail',
        message: 'Could not retrieve response headers',
        details: null
      });
      return { category: 'Security Headers', status: 'fail', message: 'No response', tests };
    }

    const headers = response.headers();

    // HTTPS check
    const isHttps = siteData.startUrl.startsWith('https://');
    tests.push({
      name: 'HTTPS',
      status: isHttps ? 'pass' : 'fail',
      message: isHttps ? 'Site is served over HTTPS' : 'Site is NOT using HTTPS',
      details: { protocol: isHttps ? 'https' : 'http' }
    });

    // Content-Security-Policy
    const csp = headers['content-security-policy'] || '';
    tests.push({
      name: 'Content-Security-Policy',
      status: csp ? 'pass' : 'warn',
      message: csp ? 'CSP header is present' : 'No Content-Security-Policy header',
      details: { value: csp || 'not set' }
    });

    // X-Frame-Options
    const xfo = headers['x-frame-options'] || '';
    tests.push({
      name: 'X-Frame-Options',
      status: xfo ? 'pass' : 'warn',
      message: xfo ? `X-Frame-Options: ${xfo}` : 'No X-Frame-Options header (clickjacking risk)',
      details: { value: xfo || 'not set' }
    });

    // Strict-Transport-Security (HSTS)
    const hsts = headers['strict-transport-security'] || '';
    tests.push({
      name: 'Strict-Transport-Security',
      status: hsts ? 'pass' : isHttps ? 'warn' : 'info',
      message: hsts ? `HSTS: ${hsts}` : 'No HSTS header',
      details: { value: hsts || 'not set' }
    });

    // X-Content-Type-Options
    const xcto = headers['x-content-type-options'] || '';
    tests.push({
      name: 'X-Content-Type-Options',
      status: xcto === 'nosniff' ? 'pass' : 'warn',
      message: xcto ? `X-Content-Type-Options: ${xcto}` : 'No X-Content-Type-Options header',
      details: { value: xcto || 'not set' }
    });

    // X-XSS-Protection (legacy but still checked)
    const xxss = headers['x-xss-protection'] || '';
    tests.push({
      name: 'X-XSS-Protection',
      status: xxss ? 'pass' : 'info',
      message: xxss ? `X-XSS-Protection: ${xxss}` : 'No X-XSS-Protection header (legacy)',
      details: { value: xxss || 'not set' }
    });

    // Referrer-Policy
    const rp = headers['referrer-policy'] || '';
    tests.push({
      name: 'Referrer-Policy',
      status: rp ? 'pass' : 'info',
      message: rp ? `Referrer-Policy: ${rp}` : 'No Referrer-Policy header',
      details: { value: rp || 'not set' }
    });

    // Permissions-Policy
    const pp = headers['permissions-policy'] || headers['feature-policy'] || '';
    tests.push({
      name: 'Permissions-Policy',
      status: pp ? 'pass' : 'info',
      message: pp ? 'Permissions-Policy header present' : 'No Permissions-Policy header',
      details: { value: pp || 'not set' }
    });

    // Server header (information leak)
    const server = headers['server'] || '';
    tests.push({
      name: 'Server Header Exposure',
      status: server ? 'info' : 'pass',
      message: server ? `Server header exposes: "${server}"` : 'Server header not exposed (good)',
      details: { value: server || 'not exposed' }
    });

    // X-Powered-By (information leak)
    const xpb = headers['x-powered-by'] || '';
    tests.push({
      name: 'X-Powered-By Exposure',
      status: xpb ? 'warn' : 'pass',
      message: xpb ? `X-Powered-By exposes: "${xpb}" — consider removing` : 'X-Powered-By not exposed (good)',
      details: { value: xpb || 'not exposed' }
    });

  } finally {
    await browser.close();
  }

  return {
    category: 'Security Headers',
    status: tests.some(t => t.status === 'fail') ? 'fail' : tests.some(t => t.status === 'warn') ? 'warn' : 'pass',
    message: `Checked ${tests.length} security headers`,
    tests
  };
}

module.exports = { run };
