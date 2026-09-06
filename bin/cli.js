#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { runTests } = require('../src/testRunner');
const { runScenario } = require('../src/scenarioRunner');
const { getStorageStatePath } = require('../src/auth');
const { generateAuditJUnit, generateScenarioJUnit } = require('../src/utils/junitReporter');

// Parse CLI arguments
function parseArgs(args) {
  const options = {
    url: null,
    scenario: null,
    auth: null,
    minScore: 80,
    output: path.join(process.cwd(), 'reports'),
    format: 'both',
    headed: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--url' && args[i + 1]) options.url = args[++i];
    else if (arg === '--scenario' && args[i + 1]) options.scenario = args[++i];
    else if (arg === '--auth' && args[i + 1]) options.auth = args[++i];
    else if (arg === '--min-score' && args[i + 1]) options.minScore = parseInt(args[++i], 10);
    else if (arg === '--output' && args[i + 1]) options.output = args[++i];
    else if (arg === '--format' && args[i + 1]) options.format = args[++i];
    else if (arg === '--headed') options.headed = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
  }

  return options;
}

function printHelp() {
  console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║              🧪  AutoTest Pro Enterprise CLI              ║
  ║       Headless E2E & Site Health Quality Gatekeeper       ║
  ╚═══════════════════════════════════════════════════════════╝

  Usage:
    autotest-pro --url <URL> [options]
    autotest-pro --scenario <path> [options]

  Options:
    --url <url>           Target URL for audit or scenario base URL
    --scenario <file>     Path to E2E scenario JSON (transactional testing)
    --auth <sessionId>    Saved auth session profile ID
    --min-score <0-100>   Minimum required Health Score to pass CI (default: 80)
    --output <dir>        Directory to store reports & screenshots (default: ./reports)
    --format <type>       Report format: junit, json, or both (default: both)
    --headed              Launch browser in visible UI mode (debugging)
    --help, -h            Show this help manual

  Examples for CI/CD Pipelines:
    # Run full site health & WCAG compliance audit
    autotest-pro --url https://staging.corp.internal --min-score 85 --output ./reports

    # Run post-login transactional E2E journey
    autotest-pro --scenario data/scenarios/sample-e2e.json --output ./reports
  `);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help || (!options.url && !options.scenario)) {
    printHelp();
    process.exit(options.help ? 0 : 1);
  }

  if (!fs.existsSync(options.output)) {
    fs.mkdirSync(options.output, { recursive: true });
  }

  let storageState = null;
  if (options.auth) {
    storageState = getStorageStatePath(options.auth);
    if (!storageState) {
      console.warn(`\x1b[33m[WARN] Auth session "${options.auth}" not found. Running unauthenticated.\x1b[0m`);
    } else {
      console.log(`\x1b[32m[AUTH] Using authenticated session: ${options.auth}\x1b[0m`);
    }
  }

  // ── Mode 1: Run E2E Scenario Journey ──
  if (options.scenario) {
    const scenarioPath = path.isAbsolute(options.scenario)
      ? options.scenario
      : path.join(process.cwd(), options.scenario);

    if (!fs.existsSync(scenarioPath)) {
      console.error(`\x1b[31m[ERROR] Scenario file not found: ${scenarioPath}\x1b[0m`);
      process.exit(1);
    }

    const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));
    console.log(`\n\x1b[1m\x1b[36m🚀 Running E2E Scenario: ${scenario.name || options.scenario}\x1b[0m`);
    console.log(`Target Base URL: ${options.url || scenario.baseUrl || 'Inline steps'}`);

    const result = await runScenario(scenario, {
      baseUrl: options.url || scenario.baseUrl,
      storageState,
      headless: !options.headed,
      screenshotsDir: path.join(options.output, 'screenshots'),
      onStepProgress: (step) => {
        const icon = step.status === 'pass' ? '\x1b[32m✓\x1b[0m' : step.status === 'fail' ? '\x1b[31m✗\x1b[0m' : '⋯';
        if (step.status !== 'running') {
          console.log(`  ${icon} Step ${step.index}: ${step.name} (${step.duration}ms)`);
          if (step.error) {
            console.log(`     \x1b[31mError: ${step.error}\x1b[0m`);
          }
        }
      }
    });

    // Write outputs
    if (options.format === 'junit' || options.format === 'both') {
      const junitXml = generateScenarioJUnit(result);
      const junitFile = path.join(options.output, 'junit.xml');
      fs.writeFileSync(junitFile, junitXml, 'utf8');
      console.log(`\n📄 JUnit report generated: ${junitFile}`);
    }

    if (options.format === 'json' || options.format === 'both') {
      const jsonFile = path.join(options.output, 'scenario-results.json');
      fs.writeFileSync(jsonFile, JSON.stringify(result, null, 2), 'utf8');
      console.log(`📊 JSON report generated: ${jsonFile}`);
    }

    console.log('\n─────────────────────────────────────────────────────────────');
    if (result.passed) {
      console.log(`\x1b[32m\x1b[1mSUCCESS: All ${result.passedSteps}/${result.totalSteps} scenario steps passed in ${(result.duration / 1000).toFixed(2)}s\x1b[0m\n`);
      process.exit(0);
    } else {
      console.log(`\x1b[31m\x1b[1mFAILED: Scenario failed at step with ${result.failedSteps} error(s)\x1b[0m\n`);
      process.exit(1);
    }
  }

  // ── Mode 2: Run Site Health & Compliance Audit ──
  console.log(`\n\x1b[1m\x1b[36m🔍 Running AutoTest Pro Audit on: ${options.url}\x1b[0m`);
  console.log(`Required Minimum Health Score: ${options.minScore}\n`);

  try {
    const { results, summary } = await runTests(options.url, {
      auth: storageState ? { sessionId: options.auth } : null,
      screenshotsDir: path.join(options.output, 'screenshots'),
      onProgress: (category, data) => {
        if (data.status !== 'running') {
          const icon = data.status === 'pass' ? '\x1b[32m✓\x1b[0m' : data.status === 'warn' ? '\x1b[33m⚠\x1b[0m' : '\x1b[31m✗\x1b[0m';
          console.log(`  ${icon} [${category}] ${data.message || ''}`);
        }
      }
    });

    console.log('\n─────────────────────────────────────────────────────────────');
    console.log(`Health Score: \x1b[1m${summary.healthScore}/100\x1b[0m (Grade ${summary.grade})`);
    console.log(`Total Tests: ${summary.totalTests} | Passed: ${summary.passed} | Failed: ${summary.failed} | Warnings: ${summary.warnings}`);

    // Generate JUnit & JSON
    if (options.format === 'junit' || options.format === 'both') {
      const junitXml = generateAuditJUnit(summary, results);
      const junitFile = path.join(options.output, 'junit.xml');
      fs.writeFileSync(junitFile, junitXml, 'utf8');
      console.log(`📄 JUnit report generated: ${junitFile}`);
    }

    if (options.format === 'json' || options.format === 'both') {
      const jsonFile = path.join(options.output, 'audit-results.json');
      fs.writeFileSync(jsonFile, JSON.stringify({ summary, results }, null, 2), 'utf8');
      console.log(`📊 JSON report generated: ${jsonFile}`);
    }

    console.log(`\n\x1b[36m─────────────────────────────────────────────────────────────\x1b[0m`);
    console.log(`\x1b[1m💡 Want the Real-Time Web Dashboard & Pre-built CI/CD Pipelines?\x1b[0m`);
    console.log(`👉 \x1b[33mhttps://priyex.lemonsqueezy.com/checkout/buy/d89c870f-f836-4e9e-b254-8bfa72afd575\x1b[0m`);
    console.log(`\x1b[36m─────────────────────────────────────────────────────────────\x1b[0m\n`);

    if (summary.healthScore < options.minScore) {
      console.log(`\x1b[31m\x1b[1mPIPELINE FAILED: Health score ${summary.healthScore} is below threshold ${options.minScore}\x1b[0m\n`);
      process.exit(1);
    } else {
      console.log(`\x1b[32m\x1b[1mPIPELINE PASSED: Quality gate passed with score ${summary.healthScore}\x1b[0m\n`);
      process.exit(0);
    }
  } catch (err) {
    console.error(`\n\x1b[31m[CRITICAL ERROR] Test suite crashed: ${err.message}\x1b[0m`);
    process.exit(1);
  }
}

main();
