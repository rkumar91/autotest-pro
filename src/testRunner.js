const { crawlSite } = require('./crawler');
const { generateSummary } = require('./utils/reporter');
const { getStorageStatePath, performFormLogin } = require('./auth');

// Import test modules
const pageLoadTests = require('./tests/pageLoad');
const accessibilityTests = require('./tests/accessibility');
const linkTests = require('./tests/links');
const formTests = require('./tests/forms');
const seoTests = require('./tests/seo');
const securityTests = require('./tests/security');
const responsiveTests = require('./tests/responsive');
const consoleTests = require('./tests/console');
const imageTests = require('./tests/images');

/**
 * Orchestrates the full test suite.
 * Crawls the site, then runs all test modules sequentially,
 * streaming results in real-time via the onProgress callback.
 */
async function runTests(url, options = {}) {
  const { onProgress, onComplete, onError, screenshotsDir, sessionId, auth } = options;

  try {
    // Resolve authentication if specified
    let activeStorageState = null;
    let authInfo = null;

    if (auth) {
      if (auth.sessionId) {
        activeStorageState = getStorageStatePath(auth.sessionId);
        authInfo = { type: 'saved_session', sessionId: auth.sessionId };
      } else if (auth.mode === 'form' && auth.credentials) {
        if (onProgress) {
          onProgress('auth', {
            category: 'Authentication',
            status: 'running',
            message: 'Performing automated form login...',
            tests: []
          });
        }
        try {
          const session = await performFormLogin(auth.loginUrl || url, auth.credentials);
          activeStorageState = session.filePath;
          authInfo = { type: 'form_credentials', username: auth.credentials.username };

          if (onProgress) {
            onProgress('auth', {
              category: 'Authentication',
              status: 'pass',
              message: `Successfully authenticated as ${auth.credentials.username}`,
              tests: [{
                name: 'Form Authentication',
                status: 'pass',
                message: `Logged in and session captured (${session.cookiesCount} cookies)`,
                details: { type: session.type, cookiesCount: session.cookiesCount }
              }]
            });
          }
        } catch (err) {
          if (onProgress) {
            onProgress('auth', {
              category: 'Authentication',
              status: 'fail',
              message: `Form login failed: ${err.message}`,
              tests: [{
                name: 'Form Authentication',
                status: 'fail',
                message: err.message,
                details: null
              }]
            });
          }
          throw err;
        }
      } else if (auth.storageState) {
        activeStorageState = auth.storageState;
        authInfo = { type: 'custom_state' };
      }
    }

    // Phase 1: Crawl the site
    if (onProgress) {
      onProgress('crawler', {
        category: 'crawler',
        status: 'running',
        message: activeStorageState
          ? 'Crawling website as authenticated user...'
          : 'Crawling website and discovering pages...',
        tests: []
      });
    }

    const siteData = await crawlSite(url, {
      maxDepth: options.maxDepth || 2,
      maxPages: options.maxPages || 20,
      storageState: activeStorageState
    });

    siteData.auth = authInfo;

    const crawlTests = [{
      name: 'Site Crawl',
      status: 'info',
      message: `Found ${siteData.totalPages} page(s) within the site`,
      details: {
        totalPages: siteData.totalPages,
        authenticated: !!activeStorageState,
        pages: siteData.pages.map(p => ({ url: p.url, title: p.title, status: p.status, isLoginGate: p.isLoginGate }))
      }
    }];

    // Check for login gates
    const loginGates = siteData.pages.filter(p => p.isLoginGate);
    if (loginGates.length > 0) {
      crawlTests.push({
        name: 'Login Gate Detection',
        status: activeStorageState ? 'info' : 'warn',
        message: activeStorageState
          ? `${loginGates.length} page(s) identified as auth/login endpoints`
          : `${loginGates.length} page(s) redirected to login/SSO. Use Authentication Settings to test protected areas.`,
        details: {
          gates: loginGates.map(g => ({ url: g.url, finalUrl: g.finalUrl, status: g.status }))
        }
      });
    }

    if (onProgress) {
      onProgress('crawler', {
        category: 'crawler',
        status: 'complete',
        message: `Discovered ${siteData.totalPages} page(s)${activeStorageState ? ' (Authenticated)' : ''}`,
        tests: crawlTests
      });
    }

    // Phase 2: Run test modules
    const testModules = [
      { name: 'Page Load & Performance', module: pageLoadTests },
      { name: 'Accessibility', module: accessibilityTests },
      { name: 'Links', module: linkTests },
      { name: 'Forms', module: formTests },
      { name: 'SEO', module: seoTests },
      { name: 'Security Headers', module: securityTests },
      { name: 'Responsive Design', module: responsiveTests },
      { name: 'Console Errors', module: consoleTests },
      { name: 'Images', module: imageTests }
    ];

    const allResults = [];

    for (const { name, module } of testModules) {
      try {
        // Notify that this category is starting
        if (onProgress) {
          onProgress(name, {
            category: name,
            status: 'running',
            message: `Running ${name} tests...`,
            tests: []
          });
        }

        const result = await module.run(siteData, {
          screenshotsDir,
          sessionId,
          url,
          storageState: activeStorageState
        });

        allResults.push(result);

        if (onProgress) {
          onProgress(name, result);
        }
      } catch (err) {
        const errorResult = {
          category: name,
          status: 'error',
          message: `Error running ${name}: ${err.message}`,
          tests: [{
            name: `${name} Error`,
            status: 'fail',
            message: err.message,
            details: null
          }]
        };
        allResults.push(errorResult);

        if (onProgress) {
          onProgress(name, errorResult);
        }
      }
    }

    // Phase 3: Generate summary
    const summary = generateSummary(allResults, siteData);

    if (onComplete) {
      onComplete(summary);
    }

    return { results: allResults, summary, siteData };

  } catch (err) {
    if (onError) {
      onError(err);
    }
    throw err;
  }
}

module.exports = { runTests };
