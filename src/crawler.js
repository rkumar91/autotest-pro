const { chromium } = require('playwright');

/**
 * Crawls a website starting from the given URL.
 * Discovers internal pages, forms, buttons, links, and images.
 * Stays within the same origin and respects depth limits.
 * 
 * 100% local — no data sent externally.
 */
async function crawlSite(url, options = {}) {
  const maxDepth = options.maxDepth || 2;
  const maxPages = options.maxPages || 20;
  const baseUrl = new URL(url);
  const origin = baseUrl.origin;

  const visited = new Set();
  const pages = [];
  const queue = [{ url: normalizeUrl(url), depth: 0 }];

  const browser = await chromium.launch({ headless: true });
  const contextOptions = {
    userAgent: 'AutoTest-Pro/1.0 (Local Testing Tool)',
    viewport: { width: 1440, height: 900 }
  };
  if (options.storageState) {
    contextOptions.storageState = options.storageState;
  }
  const context = await browser.newContext(contextOptions);

  try {
    while (queue.length > 0 && pages.length < maxPages) {
      const { url: currentUrl, depth } = queue.shift();

      if (visited.has(currentUrl)) continue;
      visited.add(currentUrl);

      const page = await context.newPage();
      const pageData = {
        url: currentUrl,
        finalUrl: currentUrl,
        isLoginGate: false,
        depth,
        status: null,
        title: '',
        loadTime: 0,
        links: [],
        forms: [],
        buttons: [],
        images: [],
        headings: [],
        meta: {},
        errors: []
      };

      try {
        const startTime = Date.now();
        const response = await page.goto(currentUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        pageData.loadTime = Date.now() - startTime;
        pageData.status = response ? response.status() : null;

        // Wait for network to settle
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

        pageData.finalUrl = page.url();
        pageData.title = await page.title();

        // Detect if page redirected to a login gate
        const isAuthRedirect = /login|signin|oauth|auth|sso|entra/i.test(pageData.finalUrl) &&
          !/login|signin|oauth|auth|sso|entra/i.test(currentUrl);
        pageData.isLoginGate = isAuthRedirect || pageData.status === 401 || pageData.status === 403;

        // Extract page data
        const extractedData = await page.evaluate((origin) => {
          const data = {
            links: [],
            forms: [],
            buttons: [],
            images: [],
            headings: [],
            meta: {}
          };

          // Links
          document.querySelectorAll('a[href]').forEach(a => {
            try {
              const href = a.href;
              data.links.push({
                href,
                text: (a.textContent || '').trim().substring(0, 100),
                isInternal: href.startsWith(origin),
                target: a.target || '_self',
                hasAriaLabel: !!a.getAttribute('aria-label')
              });
            } catch (e) {}
          });

          // Forms
          document.querySelectorAll('form').forEach((form, i) => {
            const inputs = [];
            form.querySelectorAll('input, textarea, select').forEach(input => {
              inputs.push({
                type: input.type || input.tagName.toLowerCase(),
                name: input.name || '',
                id: input.id || '',
                required: input.required,
                hasLabel: !!document.querySelector(`label[for="${input.id}"]`),
                placeholder: input.placeholder || '',
                ariaLabel: input.getAttribute('aria-label') || ''
              });
            });
            data.forms.push({
              action: form.action || '',
              method: (form.method || 'GET').toUpperCase(),
              id: form.id || `form-${i}`,
              inputs,
              hasSubmitButton: !!form.querySelector('button[type="submit"], input[type="submit"]')
            });
          });

          // Buttons
          document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]').forEach(btn => {
            data.buttons.push({
              text: (btn.textContent || btn.value || '').trim().substring(0, 100),
              type: btn.type || '',
              disabled: btn.disabled,
              hasAriaLabel: !!btn.getAttribute('aria-label'),
              isVisible: btn.offsetParent !== null
            });
          });

          // Images
          document.querySelectorAll('img').forEach(img => {
            data.images.push({
              src: img.src,
              alt: img.alt || '',
              hasAlt: img.hasAttribute('alt'),
              width: img.naturalWidth,
              height: img.naturalHeight,
              loading: img.loading || 'eager',
              isBroken: !img.complete || img.naturalWidth === 0
            });
          });

          // Headings
          document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
            data.headings.push({
              level: parseInt(h.tagName.charAt(1)),
              text: (h.textContent || '').trim().substring(0, 200)
            });
          });

          // Meta tags
          document.querySelectorAll('meta').forEach(meta => {
            const name = meta.name || meta.getAttribute('property') || '';
            if (name) {
              data.meta[name] = meta.content || '';
            }
          });

          // Add charset and viewport
          const charset = document.querySelector('meta[charset]');
          if (charset) data.meta['charset'] = charset.getAttribute('charset');

          return data;
        }, origin);

        Object.assign(pageData, extractedData);

        // Queue internal links for further crawling
        if (depth < maxDepth) {
          for (const link of extractedData.links) {
            if (link.isInternal && !visited.has(normalizeUrl(link.href))) {
              const normalizedHref = normalizeUrl(link.href);
              if (normalizedHref.startsWith(origin)) {
                queue.push({ url: normalizedHref, depth: depth + 1 });
              }
            }
          }
        }

      } catch (err) {
        pageData.errors.push(err.message);
        pageData.status = 'error';
      } finally {
        await page.close();
      }

      pages.push(pageData);
    }
  } finally {
    await browser.close();
  }

  return {
    origin,
    startUrl: url,
    totalPages: pages.length,
    crawledAt: new Date().toISOString(),
    pages
  };
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    // Remove trailing slash for consistency
    let normalized = u.toString();
    if (normalized.endsWith('/') && u.pathname !== '/') {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url;
  }
}

module.exports = { crawlSite };
