const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

/**
 * Replaces dynamic variables in strings
 * e.g., {{TIMESTAMP}}, {{DATE}}, {{RANDOM_EMAIL}}, {{RANDOM_STRING}}, {{UUID}}
 */
function interpolateVariables(text, customVars = {}) {
  if (typeof text !== 'string') return text;

  let result = text;
  const now = new Date();

  const defaults = {
    '{{TIMESTAMP}}': Date.now().toString(),
    '{{DATE}}': now.toISOString().split('T')[0],
    '{{RANDOM_EMAIL}}': `qa_${Math.random().toString(36).substring(2, 8)}@corp-test.local`,
    '{{RANDOM_STRING}}': `test_${Math.random().toString(36).substring(2, 10)}`,
    '{{UUID}}': 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    })
  };

  const allVars = { ...defaults, ...customVars };

  for (const [key, val] of Object.entries(allVars)) {
    result = result.split(key).join(String(val));
  }

  return result;
}

/**
 * Runs a multi-step E2E user journey scenario
 */
async function runScenario(scenario, options = {}) {
  const {
    sessionId = `scen_${Date.now()}`,
    screenshotsDir = path.join(__dirname, '..', 'screenshots'),
    storageState = null,
    onStepProgress = null,
    headless = true,
    defaultTimeout = 15000
  } = options;

  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless });
  const contextOptions = {
    viewport: scenario.viewport || { width: 1440, height: 900 },
    userAgent: 'AutoTest-Pro/1.0 (E2E Journey Runner)'
  };

  if (storageState && fs.existsSync(storageState)) {
    contextOptions.storageState = storageState;
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  page.setDefaultTimeout(defaultTimeout);

  const networkFailures = [];
  page.on('response', (response) => {
    const status = response.status();
    const url = response.url();
    // Exclude static assets like favicon or fonts from alarming noise
    if (status >= 400 && !url.match(/\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf)$/i)) {
      networkFailures.push({
        url,
        status,
        statusText: response.statusText(),
        timestamp: Date.now()
      });
    }
  });

  const startTime = Date.now();
  const stepResults = [];
  let overallPassed = true;
  const baseUrl = scenario.baseUrl || options.baseUrl || '';

  const steps = Array.isArray(scenario.steps) ? scenario.steps : [];

  try {
    for (let index = 0; index < steps.length; index++) {
      const rawStep = steps[index];
      const stepIndex = index + 1;
      const stepStartTime = Date.now();
      const stepDesc = rawStep.name || rawStep.description || `Step ${stepIndex}: ${rawStep.action || rawStep.assert}`;

      const stepRecord = {
        index: stepIndex,
        name: stepDesc,
        action: rawStep.action || null,
        assert: rawStep.assert || null,
        status: 'running',
        duration: 0,
        screenshotUrl: null,
        error: null,
        details: {}
      };

      if (onStepProgress) {
        onStepProgress({ ...stepRecord });
      }

      try {
        // Execute Action
        if (rawStep.action) {
          switch (rawStep.action) {
            case 'navigate': {
              let targetUrl = rawStep.url || rawStep.target;
              targetUrl = interpolateVariables(targetUrl, scenario.variables);
              if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
                targetUrl = new URL(targetUrl, baseUrl).toString();
              }
              await page.goto(targetUrl, {
                waitUntil: rawStep.waitUntil || 'domcontentloaded',
                timeout: rawStep.timeout || defaultTimeout
              });
              stepRecord.details = { url: targetUrl, currentUrl: page.url() };
              break;
            }

            case 'click': {
              const selector = rawStep.selector;
              await page.waitForSelector(selector, {
                state: 'visible',
                timeout: rawStep.timeout || defaultTimeout
              });
              await page.click(selector, { timeout: rawStep.timeout || defaultTimeout });
              stepRecord.details = { selector };
              break;
            }

            case 'fill': {
              const selector = rawStep.selector;
              const val = interpolateVariables(rawStep.value || '', scenario.variables);
              await page.waitForSelector(selector, {
                state: 'visible',
                timeout: rawStep.timeout || defaultTimeout
              });
              await page.fill(selector, val, { timeout: rawStep.timeout || defaultTimeout });
              stepRecord.details = { selector, valueLength: val.length };
              break;
            }

            case 'type': {
              const selector = rawStep.selector;
              const text = interpolateVariables(rawStep.text || '', scenario.variables);
              await page.type(selector, text, { delay: rawStep.delay || 50 });
              stepRecord.details = { selector, textLength: text.length };
              break;
            }

            case 'select': {
              const selector = rawStep.selector;
              const value = interpolateVariables(rawStep.value || '', scenario.variables);
              await page.selectOption(selector, value);
              stepRecord.details = { selector, selected: value };
              break;
            }

            case 'check': {
              await page.check(rawStep.selector);
              stepRecord.details = { selector: rawStep.selector, checked: true };
              break;
            }

            case 'uncheck': {
              await page.uncheck(rawStep.selector);
              stepRecord.details = { selector: rawStep.selector, checked: false };
              break;
            }

            case 'pressKey': {
              const key = rawStep.key || 'Enter';
              if (rawStep.selector) {
                await page.press(rawStep.selector, key);
              } else {
                await page.keyboard.press(key);
              }
              stepRecord.details = { key, selector: rawStep.selector || 'window' };
              break;
            }

            case 'hover': {
              await page.hover(rawStep.selector);
              stepRecord.details = { selector: rawStep.selector };
              break;
            }

            case 'wait': {
              if (rawStep.time) {
                await page.waitForTimeout(Number(rawStep.time));
                stepRecord.details = { waitedMs: Number(rawStep.time) };
              } else if (rawStep.selector) {
                await page.waitForSelector(rawStep.selector, {
                  state: rawStep.state || 'visible',
                  timeout: rawStep.timeout || defaultTimeout
                });
                stepRecord.details = { waitedForSelector: rawStep.selector, state: rawStep.state || 'visible' };
              }
              break;
            }

            case 'reload': {
              await page.reload({ waitUntil: 'domcontentloaded' });
              stepRecord.details = { reloaded: true };
              break;
            }

            case 'screenshot': {
              // Handled after action switch
              stepRecord.details = { screenshotCaptured: true };
              break;
            }

            default:
              throw new Error(`Unsupported action: ${rawStep.action}`);
          }
        }

        // Execute Assertion
        if (rawStep.assert) {
          switch (rawStep.assert) {
            case 'assertVisible': {
              const selector = rawStep.selector;
              await page.waitForSelector(selector, {
                state: 'visible',
                timeout: rawStep.timeout || defaultTimeout
              });
              stepRecord.details = { ...stepRecord.details, verifiedVisible: selector };
              break;
            }

            case 'assertNotVisible': {
              const selector = rawStep.selector;
              await page.waitForSelector(selector, {
                state: 'hidden',
                timeout: rawStep.timeout || defaultTimeout
              });
              stepRecord.details = { ...stepRecord.details, verifiedHidden: selector };
              break;
            }

            case 'assertText': {
              const selector = rawStep.selector;
              const expected = interpolateVariables(rawStep.text || '', scenario.variables);
              await page.waitForSelector(selector, { state: 'visible', timeout: rawStep.timeout || defaultTimeout });
              const actual = await page.textContent(selector);
              const matches = rawStep.exact
                ? actual.trim() === expected.trim()
                : actual.toLowerCase().includes(expected.toLowerCase());

              if (!matches) {
                throw new Error(`Text assertion failed on [${selector}]. Expected "${expected}", but found "${actual.trim()}"`);
              }
              stepRecord.details = { ...stepRecord.details, actualText: actual.trim(), expectedText: expected };
              break;
            }

            case 'assertUrl': {
              const expectedUrl = interpolateVariables(rawStep.match || rawStep.url || '', scenario.variables);
              const currentUrl = page.url();
              if (!currentUrl.includes(expectedUrl)) {
                throw new Error(`URL assertion failed. Current URL "${currentUrl}" does not include "${expectedUrl}"`);
              }
              stepRecord.details = { ...stepRecord.details, currentUrl, match: expectedUrl };
              break;
            }

            case 'assertTitle': {
              const expected = interpolateVariables(rawStep.match || rawStep.title || '', scenario.variables);
              const actualTitle = await page.title();
              if (!actualTitle.toLowerCase().includes(expected.toLowerCase())) {
                throw new Error(`Title assertion failed. Title "${actualTitle}" does not contain "${expected}"`);
              }
              stepRecord.details = { ...stepRecord.details, actualTitle, match: expected };
              break;
            }

            default:
              throw new Error(`Unsupported assertion: ${rawStep.assert}`);
          }
        }

        // Capture step screenshot if requested or if it is a screenshot step
        if (rawStep.screenshot || rawStep.action === 'screenshot') {
          const shotName = `step_${sessionId}_${stepIndex}_${Date.now()}.png`;
          const shotPath = path.join(screenshotsDir, shotName);
          await page.screenshot({ path: shotPath, fullPage: false });
          stepRecord.screenshotUrl = `/screenshots/${shotName}`;
        }

        stepRecord.status = 'pass';
        stepRecord.duration = Date.now() - stepStartTime;
      } catch (err) {
        stepRecord.status = 'fail';
        stepRecord.error = err.message;
        stepRecord.duration = Date.now() - stepStartTime;
        overallPassed = false;

        // Capture screenshot on failure
        try {
          const failShotName = `fail_${sessionId}_${stepIndex}_${Date.now()}.png`;
          const failShotPath = path.join(screenshotsDir, failShotName);
          await page.screenshot({ path: failShotPath, fullPage: false });
          stepRecord.screenshotUrl = `/screenshots/${failShotName}`;
        } catch {
          // ignore screenshot failure if page closed
        }

        stepResults.push(stepRecord);
        if (onStepProgress) onStepProgress({ ...stepRecord });

        // Stop further execution on failure unless continueOnError is specified
        if (!rawStep.continueOnError) {
          break;
        }
        continue;
      }

      stepResults.push(stepRecord);
      if (onStepProgress) onStepProgress({ ...stepRecord });
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const duration = Date.now() - startTime;
  const passedSteps = stepResults.filter(s => s.status === 'pass').length;
  const failedSteps = stepResults.filter(s => s.status === 'fail').length;

  return {
    scenarioId: scenario.id || `scenario_${Date.now()}`,
    scenarioName: scenario.name || 'Untitled Journey',
    passed: overallPassed && failedSteps === 0,
    totalSteps: steps.length,
    executedSteps: stepResults.length,
    passedSteps,
    failedSteps,
    duration,
    steps: stepResults,
    networkFailures,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  runScenario,
  interpolateVariables
};
