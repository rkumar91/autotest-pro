/**
 * SEO Audit Tests
 * Checks title, meta description, Open Graph tags, canonical URL, 
 * robots meta, and other SEO essentials.
 */
async function run(siteData, options = {}) {
  const tests = [];

  for (const page of siteData.pages) {
    const pageLabel = new URL(page.url).pathname || '/';

    // Title tag
    tests.push({
      name: `Title Tag [${pageLabel}]`,
      status: page.title && page.title.length > 0
        ? (page.title.length >= 30 && page.title.length <= 60 ? 'pass' : 'warn')
        : 'fail',
      message: page.title
        ? `"${page.title}" (${page.title.length} chars${page.title.length < 30 ? ' — too short' : page.title.length > 60 ? ' — too long' : ' — good length'})`
        : 'Missing title tag',
      details: { title: page.title, length: page.title ? page.title.length : 0 }
    });

    // Meta description
    const metaDesc = page.meta?.description || page.meta?.Description || '';
    tests.push({
      name: `Meta Description [${pageLabel}]`,
      status: metaDesc
        ? (metaDesc.length >= 120 && metaDesc.length <= 160 ? 'pass' : 'warn')
        : 'fail',
      message: metaDesc
        ? `${metaDesc.length} chars${metaDesc.length < 120 ? ' — too short' : metaDesc.length > 160 ? ' — too long' : ' — good length'}`
        : 'Missing meta description',
      details: { description: metaDesc }
    });

    // Open Graph tags
    const ogTitle = page.meta?.['og:title'] || '';
    const ogDesc = page.meta?.['og:description'] || '';
    const ogImage = page.meta?.['og:image'] || '';
    const ogType = page.meta?.['og:type'] || '';

    const ogTags = [
      { name: 'og:title', value: ogTitle },
      { name: 'og:description', value: ogDesc },
      { name: 'og:image', value: ogImage },
      { name: 'og:type', value: ogType }
    ];

    const presentOg = ogTags.filter(t => t.value);
    tests.push({
      name: `Open Graph Tags [${pageLabel}]`,
      status: presentOg.length >= 3 ? 'pass' : presentOg.length > 0 ? 'warn' : 'fail',
      message: `${presentOg.length}/4 OG tags present`,
      details: {
        tags: ogTags.map(t => ({ name: t.name, present: !!t.value, value: t.value || 'missing' }))
      }
    });

    // Twitter Card tags
    const twitterCard = page.meta?.['twitter:card'] || '';
    const twitterTitle = page.meta?.['twitter:title'] || '';
    tests.push({
      name: `Twitter Card [${pageLabel}]`,
      status: twitterCard ? 'pass' : 'info',
      message: twitterCard ? `Card type: ${twitterCard}` : 'No Twitter Card meta tags',
      details: { card: twitterCard, title: twitterTitle }
    });

    // Canonical URL
    // Note: canonical is usually a <link> tag, not meta — check if it was captured
    const canonical = page.meta?.canonical || '';
    tests.push({
      name: `Canonical URL [${pageLabel}]`,
      status: canonical ? 'pass' : 'info',
      message: canonical ? `Canonical: ${canonical}` : 'No canonical URL meta found',
      details: { canonical }
    });

    // Robots meta
    const robots = page.meta?.robots || '';
    tests.push({
      name: `Robots Meta [${pageLabel}]`,
      status: robots
        ? (robots.includes('noindex') ? 'warn' : 'pass')
        : 'info',
      message: robots
        ? `robots: "${robots}"${robots.includes('noindex') ? ' ⚠️ Page is noindexed' : ''}`
        : 'No robots meta tag (defaults to index,follow)',
      details: { robots }
    });

    // Charset
    const charset = page.meta?.charset || '';
    tests.push({
      name: `Charset [${pageLabel}]`,
      status: charset ? 'pass' : 'warn',
      message: charset ? `Charset: ${charset}` : 'No charset declaration found',
      details: { charset }
    });

    // Viewport meta
    const viewport = page.meta?.viewport || '';
    tests.push({
      name: `Viewport Meta [${pageLabel}]`,
      status: viewport ? 'pass' : 'fail',
      message: viewport ? `viewport: "${viewport}"` : 'Missing viewport meta tag — mobile unfriendly',
      details: { viewport }
    });
  }

  return {
    category: 'SEO',
    status: tests.some(t => t.status === 'fail') ? 'fail' : tests.some(t => t.status === 'warn') ? 'warn' : 'pass',
    message: `SEO audit across ${siteData.pages.length} page(s)`,
    tests
  };
}

module.exports = { run };
