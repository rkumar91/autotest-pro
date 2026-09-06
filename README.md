# 🧪 AutoTest Pro

> **Local E2E UI Testing, Site Health & Accessibility Gatekeeper with Real-Time Dashboard**  
> *100% Local • Zero Data Leakage • CI/CD Quality Gate • Enterprise Ready*

[![Playwright](https://img.shields.io/badge/Engine-Playwright-2EAD33.svg?logo=playwright&logoColor=white)](https://playwright.dev/)
[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org)
[![Axe-Core](https://img.shields.io/badge/Accessibility-WCAG%202.1%20AA-blue.svg)](https://github.com/dequelabs/axe-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Privacy: 100% Local](https://img.shields.io/badge/Privacy-100%25%20Local-purple.svg)](#privacy-guarantee)

---

## ⚡ Why AutoTest Pro?

Most automated testing setups require either complex framework scaffolding or expensive third-party cloud SaaS subscriptions ($50–$200/month) that transmit sensitive test data, session tokens, and internal application screenshots outside your firewall.

**AutoTest Pro** gives you a turnkey, enterprise-grade test automation suite with a **real-time visual web dashboard**, a headless **CI/CD CLI gatekeeper**, and **zero cloud dependencies**:

- 🔒 **100% Local Execution**: All browser instances, screenshots, and test artifacts run and stay strictly on your machine or private runner.
- 📊 **Real-Time Visual Dashboard**: Watch test steps execute live with status indicators, metrics, and instant visual screenshots.
- ♿ **Automated WCAG Accessibility**: Built-in `@axe-core` audits detect color contrast, missing labels, ARIA violations, and HTML structure flaws.
- 🔄 **Transactional E2E Journeys**: Define multi-step user scenarios (click, type, assert, navigate) using declarative JSON configs.
- 🔑 **Saved Auth & State Persistence**: Login once interactively or via form, save the session state, and run authenticated tests repeatedly without re-authenticating.
- 🚦 **CI/CD Quality Gatekeeper**: Enforce minimum site health thresholds with automatic JUnit XML and JSON report generation.

---

## 🚀 Quick Start (60 Seconds)

### 1. Clone & Install
```bash
git clone https://github.com/priyex-tech/autotest-pro.git
cd autotest-pro
npm install
```

### 2. Install Browser Binaries (Chromium)
```bash
npx playwright install chromium
```

### 3. Launch the Visual Dashboard
```bash
npm run dev
```
Open **`http://localhost:3847`** in your browser. Enter any target URL and hit **Run Audit** to watch the suite execute in real-time!

---

## 🖥️ Two Powerful Running Modes

### Mode 1: Interactive Web Dashboard
Run the built-in server (`npm run dev` or `node server.js`) to access:
* **One-Click Site Health Audit**: Performance, visual rendering, link health, and accessibility checks.
* **Live Step Inspector**: Real-time progress with step timings and captured screenshots.
* **Session Manager**: Save and reuse authenticated browser states.
* **Audit History**: Persistent test history stored locally in `data/history.json`.

---

### Mode 2: Headless CI/CD CLI Gatekeeper
Run headlessly in GitHub Actions, GitLab CI, or Jenkins using the `autotest-pro` CLI runner:

```bash
# Run a full site health & accessibility audit with a quality gate (min score 85)
node bin/cli.js --url https://staging.yourdomain.com --min-score 85 --output ./reports

# Run a transactional multi-step E2E scenario
node bin/cli.js --scenario data/scenarios/sample-e2e.json --output ./reports

# Run using a saved authenticated session
node bin/cli.js --url https://app.yourdomain.com/dashboard --auth my-admin-session
```

#### CLI Options Reference
| Flag | Description | Default |
| :--- | :--- | :--- |
| `--url <URL>` | Target website URL to audit | `null` |
| `--scenario <path>` | Path to transactional E2E JSON scenario | `null` |
| `--min-score <0-100>` | Minimum Health Score required to pass CI gate | `80` |
| `--auth <sessionId>` | Saved authentication profile name | `null` |
| `--format <type>` | Output format: `junit`, `json`, or `both` | `both` |
| `--output <dir>` | Destination folder for reports & screenshots | `./reports` |
| `--headed` | Launch visible browser window for debugging | `false` |
| `--help`, `-h` | Display the CLI help manual | — |

---

## 🧩 E2E Scenario Configuration

Create multi-step browser journeys by simply writing declarative JSON in `data/scenarios/`:

```json
{
  "name": "User Checkout Flow",
  "baseUrl": "https://store.example.com",
  "steps": [
    { "name": "Visit Product Page", "action": "navigate", "url": "/products/item-1" },
    { "name": "Click Add to Cart", "action": "click", "selector": "#add-to-cart-btn" },
    { "name": "Verify Cart Badge", "action": "assertText", "selector": ".cart-count", "expected": "1" },
    { "name": "Capture Receipt", "action": "screenshot", "label": "cart-confirmed" }
  ]
}
```

---

## 📈 CI/CD Pipeline Integration

AutoTest Pro generates standard JUnit XML artifacts ready for GitHub Actions:

```yaml
name: E2E Quality Gate
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18

      - run: npm ci
      - run: npx playwright install --with-deps chromium

      - name: Run AutoTest Pro Quality Gate
        run: node bin/cli.js --url ${{ secrets.STAGING_URL }} --min-score 85 --output ./reports

      - name: Publish Test Results
        uses: EnricoMi/publish-unit-test-result-action@v2
        if: always()
        with:
          files: reports/junit.xml
```

---

## 🛡️ Privacy & Compliance Guarantee

* **Zero Outbound Telemetry**: No tracking beacons, third-party analytics, or cloud reporting.
* **No Database Required**: Lightweight file-backed storage (`data/` and `reports/`).
* **Air-Gapped Friendly**: Can be deployed on private VPNs, on-prem servers, and air-gapped staging environments.

---

## 🛠️ Tech Stack
* **Engine**: [Playwright](https://playwright.dev/)
* **Accessibility**: [@axe-core/playwright](https://github.com/dequelabs/axe-core)
* **Backend**: Node.js & Express
* **UI**: Vanilla HTML5, CSS3, & Modern Glassmorphism Dashboard
* **Reports**: JUnit XML & JSON

---

## 🤝 Community & Support

Maintained with ❤️ by **[Priyex Tech](https://youtube.com/@priyextech)**.

* 📺 **YouTube Tutorials**: [Watch Step-by-Step Guides & Architectural Deep Dives](https://youtube.com/@priyextech)
* 💡 **Feature Requests & Issues**: Open an issue on GitHub.

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).
