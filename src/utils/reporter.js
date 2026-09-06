/**
 * Generates a summary report from all test results.
 * Calculates health score, pass/fail/warn counts, and category breakdowns.
 */
function generateSummary(allResults, siteData) {
  let totalTests = 0;
  let passed = 0;
  let failed = 0;
  let warnings = 0;
  let info = 0;

  const categories = [];

  for (const result of allResults) {
    const categoryStats = {
      name: result.category,
      total: result.tests.length,
      passed: 0,
      failed: 0,
      warnings: 0,
      info: 0,
      status: 'pass'
    };

    for (const test of result.tests) {
      totalTests++;
      switch (test.status) {
        case 'pass':
          passed++;
          categoryStats.passed++;
          break;
        case 'fail':
          failed++;
          categoryStats.failed++;
          break;
        case 'warn':
          warnings++;
          categoryStats.warnings++;
          break;
        case 'info':
          info++;
          categoryStats.info++;
          break;
      }
    }

    // Determine category status
    if (categoryStats.failed > 0) {
      categoryStats.status = 'fail';
    } else if (categoryStats.warnings > 0) {
      categoryStats.status = 'warn';
    }

    categories.push(categoryStats);
  }

  // Calculate health score (0-100)
  const scorableTests = totalTests - info; // Don't count info-only tests
  let healthScore = 100;
  if (scorableTests > 0) {
    const failPenalty = (failed / scorableTests) * 100;
    const warnPenalty = (warnings / scorableTests) * 30; // Warnings have less impact
    healthScore = Math.max(0, Math.round(100 - failPenalty - warnPenalty));
  }

  // Determine overall grade
  let grade;
  if (healthScore >= 90) grade = 'A';
  else if (healthScore >= 80) grade = 'B';
  else if (healthScore >= 70) grade = 'C';
  else if (healthScore >= 60) grade = 'D';
  else grade = 'F';

  return {
    url: siteData.startUrl,
    timestamp: new Date().toISOString(),
    duration: Date.now() - new Date(siteData.crawledAt).getTime(),
    pagesScanned: siteData.totalPages,
    healthScore,
    grade,
    totalTests,
    passed,
    failed,
    warnings,
    info,
    categories
  };
}

module.exports = { generateSummary };
