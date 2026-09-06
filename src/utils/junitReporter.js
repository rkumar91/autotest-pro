/**
 * JUnit XML Reporter for CI/CD integrations
 * Standard format supported by Jenkins, GitLab CI, GitHub Actions, Azure DevOps.
 */

function escapeXml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Converts a site health audit run to JUnit XML
 */
function generateAuditJUnit(summary, results = []) {
  const totalTests = summary.totalTests || 0;
  const failures = summary.failed || 0;
  const durationSec = ((summary.duration || 0) / 1000).toFixed(2);
  const timestamp = summary.timestamp || new Date().toISOString();

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += `<testsuites name="AutoTest Pro Audit" tests="${totalTests}" failures="${failures}" errors="0" time="${durationSec}">\n`;

  for (const cat of results) {
    const catTests = cat.tests || [];
    const catFailures = catTests.filter(t => t.status === 'fail').length;

    xml += `  <testsuite name="${escapeXml(cat.category)}" tests="${catTests.length}" failures="${catFailures}" errors="0" timestamp="${timestamp}">\n`;

    for (const test of catTests) {
      xml += `    <testcase classname="${escapeXml(cat.category)}" name="${escapeXml(test.name)}" time="0.1">\n`;
      if (test.status === 'fail') {
        xml += `      <failure message="${escapeXml(test.message)}">\n`;
        xml += `        ${escapeXml(JSON.stringify(test.details || {}, null, 2))}\n`;
        xml += `      </failure>\n`;
      } else if (test.status === 'warn') {
        // Warnings can be output as system-out
        xml += `      <system-out>WARNING: ${escapeXml(test.message)}</system-out>\n`;
      }
      xml += `    </testcase>\n`;
    }

    xml += `  </testsuite>\n`;
  }

  xml += `</testsuites>\n`;
  return xml;
}

/**
 * Converts an E2E Scenario run to JUnit XML
 */
function generateScenarioJUnit(scenarioResult) {
  const totalSteps = scenarioResult.totalSteps || (scenarioResult.steps ? scenarioResult.steps.length : 0);
  const failures = scenarioResult.failedSteps || (scenarioResult.passed ? 0 : 1);
  const durationSec = ((scenarioResult.duration || 0) / 1000).toFixed(2);
  const timestamp = scenarioResult.timestamp || new Date().toISOString();
  const suiteName = escapeXml(scenarioResult.scenarioName || 'E2E Scenario');

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += `<testsuites name="AutoTest Pro Scenarios">\n`;
  xml += `  <testsuite name="${suiteName}" tests="${totalSteps}" failures="${failures}" errors="0" time="${durationSec}" timestamp="${timestamp}">\n`;

  if (Array.isArray(scenarioResult.steps)) {
    for (const step of scenarioResult.steps) {
      const stepDuration = ((step.duration || 0) / 1000).toFixed(2);
      xml += `    <testcase classname="${suiteName}" name="${escapeXml(step.name)}" time="${stepDuration}">\n`;
      if (step.status === 'fail') {
        xml += `      <failure message="${escapeXml(step.error || 'Step failed')}">\n`;
        xml += `        ${escapeXml(JSON.stringify(step.details || {}, null, 2))}\n`;
        xml += `      </failure>\n`;
      }
      if (step.screenshotUrl) {
        xml += `      <system-out>Screenshot: ${escapeXml(step.screenshotUrl)}</system-out>\n`;
      }
      xml += `    </testcase>\n`;
    }
  }

  xml += `  </testsuite>\n`;
  xml += `</testsuites>\n`;
  return xml;
}

module.exports = {
  generateAuditJUnit,
  generateScenarioJUnit,
  escapeXml
};
