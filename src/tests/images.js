/**
 * Image Validation Tests
 * Checks for broken images, missing alt text, and image optimization hints.
 */
async function run(siteData, options = {}) {
  const tests = [];

  for (const page of siteData.pages) {
    const pageLabel = new URL(page.url).pathname || '/';

    if (!page.images || page.images.length === 0) {
      tests.push({
        name: `Images [${pageLabel}]`,
        status: 'info',
        message: 'No images found on this page',
        details: null
      });
      continue;
    }

    // Total images
    tests.push({
      name: `Image Count [${pageLabel}]`,
      status: 'info',
      message: `${page.images.length} image(s) found`,
      details: { count: page.images.length }
    });

    // Broken images
    const brokenImages = page.images.filter(img => img.isBroken);
    tests.push({
      name: `Broken Images [${pageLabel}]`,
      status: brokenImages.length === 0 ? 'pass' : 'fail',
      message: brokenImages.length === 0
        ? 'No broken images'
        : `${brokenImages.length} broken image(s)`,
      details: {
        broken: brokenImages.map(img => ({
          src: img.src,
          alt: img.alt
        }))
      }
    });

    // Missing alt text (already in accessibility, but also relevant here)
    const missingAlt = page.images.filter(img => !img.hasAlt);
    tests.push({
      name: `Image Alt Text [${pageLabel}]`,
      status: missingAlt.length === 0 ? 'pass' : 'warn',
      message: missingAlt.length === 0
        ? 'All images have alt attributes'
        : `${missingAlt.length} image(s) missing alt attribute`,
      details: { missing: missingAlt.map(i => i.src) }
    });

    // Lazy loading check
    const lazyLoaded = page.images.filter(img => img.loading === 'lazy');
    const notLazy = page.images.filter(img => img.loading !== 'lazy');
    tests.push({
      name: `Lazy Loading [${pageLabel}]`,
      status: notLazy.length <= 3 || lazyLoaded.length > 0 ? 'pass' : 'info',
      message: `${lazyLoaded.length}/${page.images.length} images use lazy loading`,
      details: {
        lazy: lazyLoaded.length,
        eager: notLazy.length
      }
    });

    // Large image dimensions warning
    const largeImages = page.images.filter(img => img.width > 2000 || img.height > 2000);
    if (largeImages.length > 0) {
      tests.push({
        name: `Large Images [${pageLabel}]`,
        status: 'warn',
        message: `${largeImages.length} image(s) are very large (>2000px dimension)`,
        details: {
          large: largeImages.map(img => ({
            src: img.src,
            width: img.width,
            height: img.height
          }))
        }
      });
    }
  }

  return {
    category: 'Images',
    status: tests.some(t => t.status === 'fail') ? 'fail' : tests.some(t => t.status === 'warn') ? 'warn' : 'pass',
    message: `Checked images across ${siteData.pages.length} page(s)`,
    tests
  };
}

module.exports = { run };
