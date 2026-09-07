# 🎬 AutoTest Pro: 8-Minute Complete Developer Masterclass Script

**Channel**: Priyex Tech  
**Title**: Building a Local Automated Testing Suite with Playwright, Web Dashboard & CI/CD  
**Format**: 2 Audio Parts for ElevenLabs  

---

## 🎙️ PART 1 (Minutes 0:00 to 4:00) — ~2,400 Characters
*Covers: The Problem, The Solution, Architecture, and Live Dashboard Audit Walkthrough.*

### Copy and Paste This into ElevenLabs (Part 1):

```text
Welcome to Priyex Tech. Today, we are going to build and walk through a complete, production-ready automated testing suite called AutoTest Pro.

If you are a full-stack developer or QA engineer, you already know the frustration of end-to-end testing. Most cloud-based testing services cost anywhere from fifty to more than two hundred dollars every single month. Even worse, they require you to stream internal staging URLs, test credentials, and confidential application screenshots over third-party servers.

We wanted to solve this problem permanently. What if you could have an enterprise-grade automated testing suite with a real-time web dashboard, automated accessibility audits, and a headless CI/CD gatekeeper—running completely on your local machine with zero cloud bills and zero data leakage?

That is the vision behind AutoTest Pro.

Let us look at the web dashboard running locally on port 3847. We designed the interface using modern glassmorphism styling, with dark mode aesthetics and high-contrast status cards.

The dashboard allows any developer or QA analyst to run comprehensive site audits with a single click. Let us test a live application. I will enter our target URL into the input field and click Start Testing.

Notice what happens immediately behind the scenes. In the background, our Node.js server triggers Playwright to launch a headless Chromium browser instance. The crawler discovers the target pages, tests HTTP status codes, measures page load performance, and inspects visual rendering across desktop, tablet, and mobile viewports.

At the same time, the engine runs axe-core to evaluate the DOM against strict WCAG 2.1 AA accessibility guidelines. It checks for color contrast failures, missing ARIA attributes, unlabeled form inputs, and skipped heading hierarchies.

Look at the summary cards at the top. The dashboard calculates an overall Health Score out of 100 with an automated letter grade. Below the score, you can inspect each test category, view millisecond execution times, read detailed error logs, and inspect captured full-page screenshots.

Everything you see is processed locally on your hardware. No telemetry beacons, no external databases, and zero data leaving your private environment.
```

---

## 🎙️ PART 2 (Minutes 4:00 to 8:00) — ~2,500 Characters
*Covers: Visual Studio Code Deep Dive, Declarative E2E Scenarios, CI/CD Quality Gatekeeper, JUnit Reports, GitHub Repo, and Enterprise Kit.*

### Copy and Paste This into ElevenLabs (Part 2):

```text
Now that we have seen the web dashboard in action, let us open Visual Studio Code and explore the architecture under the hood.

The project is structured into three clean layers: server.js, the test engine in src, and the CLI entry point in bin. In server.js, we use Express to serve our dashboard and stream live test events using Server-Sent Events, so the user interface updates smoothly without polling.

Inside src/auth.js, we have solved one of the biggest headaches in automated testing: session persistence. Instead of logging into your application on every single test run, you can save browser cookies and storage state once, and reuse that authenticated profile across all future audits.

Next, let us look at the scenario runner in src/scenarioRunner.js. Instead of writing complex test scripts, you can define user journeys using clean, declarative JSON files. In data/scenarios/sample-e2e.json, you specify sequential actions like navigating to a URL, clicking a button, asserting text, and taking screenshots. The scenario engine runs each step with millisecond precision and captures visual evidence if any step fails.

A visual dashboard is great for local development, but how do we automate this in a continuous integration pipeline?

That is where the CLI gatekeeper in bin/cli.js comes in. You can run AutoTest Pro headlessly in GitHub Actions, GitLab CI, or Jenkins. Using the min-score flag, you can set an automated quality threshold, such as 75 or 80. If any pull request or deployment drops the site health score below your threshold, the CLI exits with code 1, automatically blocking buggy code from reaching production.

The CLI also generates standard JUnit XML reports and JSON summaries, allowing your CI platform to render native test result graphs with zero extra configuration.

AutoTest Pro is completely open-source and available on GitHub at github.com/rkumar91/autotest-pro. You can clone the repository, run npm install, and start running audits on your own applications in less than two minutes.

If you want the complete, production-ready Enterprise Kit with pre-configured GitHub Actions workflows, visual dashboard, and lifetime updates, you can grab it from the link in the description.

Thank you for watching. Please give the repository a star on GitHub, subscribe to Priyex Tech for more production-ready developer tools, and I will see you in the next tutorial!
```
