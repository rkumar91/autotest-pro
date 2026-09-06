const express = require('express');
const path = require('path');
const { runTests } = require('./src/testRunner');
const {
  listSavedSessions,
  deleteSavedSession,
  importStorageState,
  startInteractiveLogin,
  performFormLogin,
  getStorageStatePath
} = require('./src/auth');
const { runScenario } = require('./src/scenarioRunner');
const { generateAuditJUnit, generateScenarioJUnit } = require('./src/utils/junitReporter');
const fs = require('fs');

const app = express();
const PORT = 3847;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve screenshots
const screenshotsDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}
app.use('/screenshots', express.static(screenshotsDir));

// History persistence
const dataDir = path.join(__dirname, 'data');
const historyFile = path.join(dataDir, 'history.json');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Store active test sessions
const testSessions = new Map();

function loadHistory() {
  try {
    if (fs.existsSync(historyFile)) {
      const raw = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
      const items = Array.isArray(raw) ? raw : [raw];
      for (const item of items) {
        if (item && item.id) {
          testSessions.set(item.id, {
            ...item,
            clients: new Map()
          });
        }
      }
    }
  } catch (err) {
    console.error('Failed to load history:', err);
  }
}

function saveHistory() {
  try {
    const list = Array.from(testSessions.values()).map(s => ({
      id: s.id,
      url: s.url,
      startTime: s.startTime,
      completed: s.completed,
      results: s.results,
      summary: s.summary
    }));
    fs.writeFileSync(historyFile, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save history:', err);
  }
}

loadHistory();

// SSE: Real-time test progress
app.get('/api/test/:id/stream', (req, res) => {
  const sessionId = req.params.id;
  const session = testSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Test session not found' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Send any already-collected results
  for (const result of session.results) {
    res.write(`data: ${JSON.stringify({ type: 'result', data: result })}\n\n`);
  }

  if (session.completed) {
    res.write(`data: ${JSON.stringify({ type: 'complete', data: session.summary })}\n\n`);
    return res.end();
  }

  // Register this SSE client
  const clientId = Date.now().toString();
  if (!session.clients) session.clients = new Map();
  session.clients.set(clientId, res);

  req.on('close', () => {
    if (session.clients) {
      session.clients.delete(clientId);
    }
  });
});

// POST: Start a new test run
app.post('/api/test', async (req, res) => {
  const { url, options = {}, auth = null } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  const sessionId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const session = {
    id: sessionId,
    url,
    options,
    auth,
    startTime: Date.now(),
    results: [],
    completed: false,
    summary: null,
    clients: new Map()
  };

  testSessions.set(sessionId, session);

  // Respond immediately with session ID
  res.json({ sessionId, status: 'started' });

  // Run tests asynchronously
  try {
    await runTests(url, {
      ...options,
      auth,
      screenshotsDir,
      sessionId,
      onProgress: (category, result) => {
        session.results.push(result);
        // Broadcast to all SSE clients
        const msg = `data: ${JSON.stringify({ type: 'result', data: result })}\n\n`;
        for (const [, client] of session.clients) {
          client.write(msg);
        }
      },
      onComplete: (summary) => {
        session.completed = true;
        session.summary = summary;
        saveHistory();
        const msg = `data: ${JSON.stringify({ type: 'complete', data: summary })}\n\n`;
        for (const [, client] of session.clients) {
          client.write(msg);
          client.end();
        }
        session.clients.clear();
      },
      onError: (error) => {
        session.completed = true;
        session.summary = { error: error.message };
        const msg = `data: ${JSON.stringify({ type: 'error', data: { message: error.message } })}\n\n`;
        for (const [, client] of session.clients) {
          client.write(msg);
          client.end();
        }
        session.clients.clear();
      }
    });
  } catch (err) {
    console.error('Test run failed:', err);
  }
});

// GET: Latest completed test
app.get('/api/test/latest', (req, res) => {
  const sessions = Array.from(testSessions.values()).filter(s => s.completed && s.summary);
  if (sessions.length === 0) {
    return res.status(404).json({ error: 'No completed tests found' });
  }
  const latest = sessions[sessions.length - 1];
  res.json({
    id: latest.id,
    url: latest.url,
    startTime: latest.startTime,
    completed: latest.completed,
    results: latest.results,
    summary: latest.summary
  });
});

// GET: Retrieve full results
app.get('/api/test/:id/results', (req, res) => {
  const session = testSessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json({
    id: session.id,
    url: session.url,
    startTime: session.startTime,
    completed: session.completed,
    results: session.results,
    summary: session.summary
  });
});

// GET: List recent test sessions
app.get('/api/tests', (req, res) => {
  const sessions = [];
  for (const [id, session] of testSessions) {
    sessions.push({
      id,
      url: session.url,
      startTime: session.startTime,
      completed: session.completed,
      summary: session.summary
    });
  }
  res.json(sessions.slice(-20)); // Last 20 sessions
});

// ── Auth API Routes ──
app.get('/api/auth/sessions', (req, res) => {
  try {
    res.json(listSavedSessions());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/auth/sessions/:id', (req, res) => {
  try {
    deleteSavedSession(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/interactive', async (req, res) => {
  const { url, name } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const session = await startInteractiveLogin(url, { name });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/form', async (req, res) => {
  const { loginUrl, username, password, usernameSelector, passwordSelector, submitSelector, triggerSelector, name } = req.body;
  if (!loginUrl || !username || !password) {
    return res.status(400).json({ error: 'loginUrl, username, and password are required' });
  }

  try {
    const session = await performFormLogin(loginUrl, {
      username,
      password,
      usernameSelector,
      passwordSelector,
      submitSelector,
      triggerSelector,
      name
    });
    res.json(session);
  } catch (err) {
    res.status(500).json({
      error: err.message,
      screenshotUrl: err.screenshotUrl,
      pageTitle: err.pageTitle,
      currentUrl: err.currentUrl
    });
  }
});

app.post('/api/auth/import', (req, res) => {
  const { data, name, url } = req.body;
  if (!data) return res.status(400).json({ error: 'StorageState JSON is required' });

  try {
    const session = importStorageState(data, { name, url });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── JUnit XML Export for Site Audit ──
app.get('/api/test/:id/junit', (req, res) => {
  const session = testSessions.get(req.params.id);
  if (!session || !session.summary) {
    return res.status(404).send('Session or summary not found');
  }
  const xml = generateAuditJUnit(session.summary, session.results || []);
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Content-Disposition', `attachment; filename="audit-${session.id}.xml"`);
  res.send(xml);
});

// Scenarios directory & session store
const scenariosDir = path.join(dataDir, 'scenarios');
if (!fs.existsSync(scenariosDir)) {
  fs.mkdirSync(scenariosDir, { recursive: true });
}
const scenarioRuns = new Map();

// ── Scenario Management API ──
app.get('/api/scenarios', (req, res) => {
  try {
    const files = fs.readdirSync(scenariosDir).filter(f => f.endsWith('.json'));
    const list = [];
    for (const f of files) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(scenariosDir, f), 'utf8'));
        list.push({
          id: content.id || f.replace('.json', ''),
          name: content.name || f,
          description: content.description || '',
          baseUrl: content.baseUrl || '',
          stepsCount: (content.steps && content.steps.length) || 0,
          filename: f
        });
      } catch (err) {
        console.error(`Error reading scenario ${f}:`, err);
      }
    }
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/scenarios/:id', (req, res) => {
  try {
    const filename = req.params.id.endsWith('.json') ? req.params.id : `${req.params.id}.json`;
    const filePath = path.join(scenariosDir, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Scenario not found' });
    }
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json(content);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/scenarios', (req, res) => {
  try {
    const scenario = req.body;
    if (!scenario || !scenario.name || !Array.isArray(scenario.steps)) {
      return res.status(400).json({ error: 'Valid scenario object with name and steps is required' });
    }
    const id = scenario.id || `scenario_${Date.now()}`;
    scenario.id = id;
    const filePath = path.join(scenariosDir, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(scenario, null, 2), 'utf8');
    res.json({ success: true, scenario });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/scenarios/:id', (req, res) => {
  try {
    const filename = req.params.id.endsWith('.json') ? req.params.id : `${req.params.id}.json`;
    const filePath = path.join(scenariosDir, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Scenario Execution & Streaming ──
app.get('/api/scenarios/run/:id/stream', (req, res) => {
  const runId = req.params.id;
  const run = scenarioRuns.get(runId);
  if (!run) {
    return res.status(404).json({ error: 'Scenario run not found' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  for (const step of run.steps) {
    res.write(`data: ${JSON.stringify({ type: 'step', data: step })}\n\n`);
  }

  if (run.completed) {
    res.write(`data: ${JSON.stringify({ type: 'complete', data: run.result })}\n\n`);
    return res.end();
  }

  const clientId = Date.now().toString();
  if (!run.clients) run.clients = new Map();
  run.clients.set(clientId, res);

  req.on('close', () => {
    if (run.clients) run.clients.delete(clientId);
  });
});

app.post('/api/scenarios/run', async (req, res) => {
  const { scenarioId, scenarioData, authSessionId, baseUrl, headless = true } = req.body;
  let scenario = scenarioData;

  if (!scenario && scenarioId) {
    const filename = scenarioId.endsWith('.json') ? scenarioId : `${scenarioId}.json`;
    const filePath = path.join(scenariosDir, filename);
    if (fs.existsSync(filePath)) {
      scenario = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  }

  if (!scenario) {
    return res.status(400).json({ error: 'Scenario not found or not provided' });
  }

  const runId = `scen_run_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const runRecord = {
    id: runId,
    scenarioName: scenario.name,
    startTime: Date.now(),
    steps: [],
    completed: false,
    result: null,
    clients: new Map()
  };
  scenarioRuns.set(runId, runRecord);

  res.json({ runId, status: 'started' });

  // Resolve storageState
  let storageState = null;
  if (authSessionId) {
    storageState = getStorageStatePath(authSessionId);
  }

  // Execute scenario asynchronously
  try {
    const result = await runScenario(scenario, {
      sessionId: runId,
      baseUrl: baseUrl || scenario.baseUrl,
      storageState,
      headless,
      screenshotsDir,
      onStepProgress: (stepRecord) => {
        const existingIdx = runRecord.steps.findIndex(s => s.index === stepRecord.index);
        if (existingIdx >= 0) {
          runRecord.steps[existingIdx] = stepRecord;
        } else {
          runRecord.steps.push(stepRecord);
        }

        const msg = `data: ${JSON.stringify({ type: 'step', data: stepRecord })}\n\n`;
        for (const [, client] of runRecord.clients) {
          client.write(msg);
        }
      }
    });

    runRecord.completed = true;
    runRecord.result = result;

    const msg = `data: ${JSON.stringify({ type: 'complete', data: result })}\n\n`;
    for (const [, client] of runRecord.clients) {
      client.write(msg);
      client.end();
    }
    runRecord.clients.clear();
  } catch (err) {
    runRecord.completed = true;
    runRecord.result = { error: err.message, passed: false };

    const msg = `data: ${JSON.stringify({ type: 'error', data: { message: err.message } })}\n\n`;
    for (const [, client] of runRecord.clients) {
      client.write(msg);
      client.end();
    }
    runRecord.clients.clear();
  }
});

app.get('/api/scenarios/run/:id/results', (req, res) => {
  const run = scenarioRuns.get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Scenario run not found' });
  res.json(run);
});

app.get('/api/scenarios/run/:id/junit', (req, res) => {
  const run = scenarioRuns.get(req.params.id);
  if (!run || !run.result) return res.status(404).send('Scenario run result not found');
  const xml = generateScenarioJUnit(run.result);
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Content-Disposition', `attachment; filename="junit-scenario-${run.id}.xml"`);
  res.send(xml);
});

app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║                                              ║');
  console.log('  ║          🧪  AutoTest Pro  v1.0.0            ║');
  console.log('  ║     Automated E2E UI Testing Dashboard       ║');
  console.log('  ║                                              ║');
  console.log('  ║  🔒 100% Local • Zero Data Leakage           ║');
  console.log('  ║                                              ║');
  console.log(`  ║  🌐 Dashboard: http://localhost:${PORT}          ║`);
  console.log('  ║                                              ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
});
