# Social Media Brand Monitor

> **Autonomous brand intelligence, response management & community outreach — self-hosted, zero cloud required.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE.md)
[![Node: 20+](https://img.shields.io/badge/Node-20%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/Database-SQLite%20WAL-orange.svg)](https://www.sqlite.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

A production-ready monitoring system that autonomously tracks brand mentions across Reddit, Google Play, and the Apple App Store. It analyzes sentiment locally, fires webhook alerts to Slack or Discord, manages a response inbox for your team, tracks competitors, and generates weekly digest reports — all from a single self-hosted dashboard with no cloud dependency.

---

## ✨ Feature Highlights

### Core Intelligence
| Feature | Description |
|---------|-------------|
| 🌐 **Multi-Platform Monitoring** | Reddit keyword search + subreddit crawling, Google Play reviews, Apple App Store reviews |
| 🧠 **Local Sentiment Analysis** | Every mention and review classified as Positive / Neutral / Negative using the AFINN-165 lexicon — no API cost |
| 🔔 **Configurable Alerts** | Mention-spike and negative-sentiment-spike rules per project, with enable/disable toggle |
| 🏷️ **Projects & Keyword Groups** | Scope monitoring to named projects with keyword groups, competitor entities, and per-project alert rules |

### Workflow & Response Management
| Feature | Description |
|---------|-------------|
| 📭 **Response Inbox** | Bookmark mentions (⭐) and flag for action (🔔); triage with Open → In Progress → Resolved workflow and internal notes |
| 📡 **Webhook Notifications** | When an alert fires, POST to Slack, Discord, or any HTTP endpoint automatically |
| 📤 **Reddit Outreach** | Connect via OAuth 2.0 and publish drafted posts to target subreddits with a full audit trail |

### Analytics & Reporting
| Feature | Description |
|---------|-------------|
| 🔭 **Competitor Comparison** | Side-by-side mention volume, 7d/30d trends, and sentiment split for every tracked entity |
| 📊 **Weekly Digest Report** | Stakeholder-ready summary: KPIs, daily bar chart, platform breakdown, top mentions, low-rated reviews |
| 📈 **Sentiment Trend API** | Rolling-window percentages + day-by-day trend data |
| 🔍 **Global Search** | Search across mentions *and* reviews simultaneously from the header bar or via API |
| 📦 **Flexible Exports** | CSV, JSON, combined export, and Google Sheets sync |

---

## 🛠️ Prerequisites

| Requirement | Version |
|-------------|---------|
| OS | macOS, Linux, or Windows (WSL2 recommended) |
| Node.js | v20.0 or higher |
| npm | bundled with Node.js |
| RAM | 4 GB minimum (8 GB recommended for Playwright) |

---

## 📥 Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/Krishnav1237/Social-Media-Brand-Monitoring.git
cd Social-Media-Brand-Monitoring

# 2. Install dependencies
npm install

# 3. Install Chromium for Playwright
npx playwright install chromium

# 4. Configure your environment
cp .env.example .env
# Open .env and set your brand keywords, app store IDs, and optional integrations

# 5. Build and start
npm run build
npm start
```

Open **http://localhost:3000** in your browser.

---

## ⚙️ Configuration (`.env`)

### Brand & Search

| Variable | Description | Example |
|----------|-------------|---------|
| `SEARCH_TERMS` | Keywords to search on Reddit (comma-separated) | `acme,acme app,acme.io` |
| `REQUIRED_TERMS` | At least one must appear in a mention to save it | `acme.io,acme.com` |
| `FILTER_STRICT` | Only keep mentions that contain a `REQUIRED_TERMS` anchor | `false` |
| `FILTER_BALANCED` | Keep mentions only when near app/game/product context words | `true` |
| `MONITOR_SUBREDDITS` | Subreddits to crawl entirely (all posts captured) | `acme,acmegaming` |

> **Legacy aliases**: `BRAND_REQUIRED_TERMS`, `BRAND_STRICT`, `BRAND_BALANCED`, `BRAND_SUBREDDITS` are also accepted.

### App Store IDs

| Variable | Description | How to find |
|----------|-------------|-------------|
| `PLAYSTORE_APP_ID` | Google Play package name | From the URL: `?id=com.example.app` |
| `APPSTORE_APP_ID` | App Store numeric ID | From the URL: `/id1234567890` |

### Reddit Outreach (Optional)

Create a Reddit app at <https://www.reddit.com/prefs/apps> (type: **web app**, redirect URI: `http://localhost:3000/outreach/auth/callback`).

| Variable | Description |
|----------|-------------|
| `REDDIT_CLIENT_ID` | Client ID from your Reddit app |
| `REDDIT_CLIENT_SECRET` | Client secret from your Reddit app |
| `REDDIT_REDIRECT_URI` | `http://localhost:3000/outreach/auth/callback` |
| `REDDIT_USER_AGENT` | e.g. `MyMonitor/1.0` |

### Google Sheets Export (Optional)

| Variable | Description |
|----------|-------------|
| `GOOGLE_SHEETS_ENABLED` | Set to `true` to enable |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Path to your service-account credential file |
| `GOOGLE_SPREADSHEET_ID` | Sheet ID from the Google Sheets URL |

### Scrape Schedule (Cron syntax)

```ini
REDDIT_CRON="0 */4 * * *"      # Every 4 hours
PLAYSTORE_CRON="0 */3 * * *"   # Every 3 hours
APPSTORE_CRON="0 */3 * * *"    # Every 3 hours
```

### Server & Browser

```ini
PORT=3000
LOG_LEVEL=info        # error | warn | info | debug
HEADLESS=true         # Set false to watch the browser during debugging
SLOWMO=0              # ms between Playwright actions
```

---

## 🖥️ Usage

### Start the System

```bash
npm start        # Build + start (production)
npm run dev      # tsx watch mode — auto-reloads on file changes (development)
```

### Manual Scrapes

```bash
npm run scrape:reddit
npm run scrape:playstore
npm run scrape:appstore
npm run scrape:all
```

### Dashboard Pages

| URL | Description |
|-----|-------------|
| `/` | Overview — sentiment health bar, metrics cards, activity feed |
| `/mentions` | Filterable Reddit mention feed with inline bookmark/flag buttons and CSV/JSON export |
| `/reviews` | App store reviews with rating and sentiment filters |
| `/inbox` | Response inbox — bookmarked and action-required mentions with triage status and internal notes |
| `/compare` | Competitor comparison — side-by-side mention volume, trends, and sentiment for all tracked entities |
| `/report` | Weekly digest — KPIs, daily bar chart, platform breakdown, top mentions, and low-rated reviews |
| `/projects` | Project management, keyword groups, entities, alert rules, and webhook URLs |
| `/outreach` | Reddit OAuth connection, target subreddits, and post drafts |
| `/logs` | Scraper job history |

---

## 🔌 REST API Reference

### Core Data

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/stats` | Aggregate counts (mentions, reviews, last-24h) |
| `GET` | `/api/mentions` | Paginated mentions — filters: `platform`, `sentiment`, `search`, `startDate`, `endDate`, `limit`, `offset` |
| `GET` | `/api/reviews` | Paginated reviews — filters: `platform`, `rating`, `sentiment`, `search`, `startDate`, `endDate`, `limit`, `offset` |
| `GET` | `/api/trends` | Daily mention trend (`?days=30`) |
| `GET` | `/api/projects` | All projects |
| `GET` | `/api/alerts` | Alert rules and recent events |
| `GET` | `/api/status` | Scheduler info, rate-limit state, recent logs |

### Intelligence & Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Liveness probe — `{"status":"ok", ...}` |
| `GET` | `/api/search?q=<term>` | Cross-table search (mentions + reviews simultaneously) |
| `GET` | `/api/sentiment/summary` | Positive/negative/neutral percentages + daily trend (`?days=30`) |
| `GET` | `/api/compare` | Entity comparison per project (`?projectId=&days=30`) |
| `GET` | `/api/report/weekly` | Weekly digest JSON (`?weeksAgo=0`) |

### Response Inbox

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/inbox` | All bookmarked or action-required mentions |
| `POST` | `/mentions/:id/bookmark` | Toggle bookmark flag |
| `POST` | `/mentions/:id/action` | Toggle action-required flag |
| `POST` | `/mentions/:id/status` | Update triage status (`open` / `in_progress` / `resolved`) |
| `POST` | `/mentions/:id/notes` | Save internal notes |

### Exports

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/export/mentions` | Mentions as CSV |
| `GET` | `/api/export/mentions.json` | Mentions as JSON attachment |
| `GET` | `/api/export/reviews` | Reviews as CSV |
| `GET` | `/api/export/reviews.json` | Reviews as JSON attachment |
| `GET` | `/api/export/all` | Combined mentions + reviews as a single CSV |
| `GET` | `/api/export/sheets?type=mentions\|reviews` | Push to Google Sheets |

### Outreach

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/outreach` | Outreach dashboard |
| `GET` | `/outreach/auth` | Start Reddit OAuth flow |
| `GET` | `/outreach/auth/callback` | OAuth callback (auto-handled) |
| `POST` | `/outreach/auth/disconnect` | Remove stored Reddit tokens |
| `POST` | `/outreach/subreddits` | Add a target subreddit |
| `POST` | `/outreach/subreddits/:id/toggle` | Enable/disable a subreddit |
| `POST` | `/outreach/subreddits/:id/delete` | Remove a subreddit |
| `POST` | `/outreach/drafts` | Create a draft post |
| `POST` | `/outreach/drafts/:id/submit` | Publish a draft to Reddit |
| `POST` | `/outreach/drafts/:id/delete` | Delete a draft |
| `GET` | `/api/outreach/drafts/:id/attempts` | Post attempt audit log |

---

## 🔍 Troubleshooting

| Problem | Solution |
|---------|----------|
| **Playwright launch fails** | Run `npx playwright install chromium` to download the Chromium binary |
| **"Rate Limit Exceeded"** | Increase cron intervals in `.env` or add proxy credentials. The system backs off automatically, but a longer interval prevents repeated bursts |
| **"Database Locked"** | Close any SQLite GUI that has `data/monitor.db` open, then restart the app |
| **Dashboard not loading** | Run `npm run build` to regenerate `dist/`. Use `npm run dev` during development |
| **Outreach — "Invalid OAuth state"** | OAuth states expire after 10 minutes. Re-start the flow from `/outreach` |
| **No data showing** | Check the Logs page for failed entries. Verify `REQUIRED_TERMS` are not too strict |
| **Webhook not firing** | Confirm the webhook URL is saved on the alert rule and your Slack/Discord app has incoming webhooks enabled |

---

## 📁 Project Structure

```
src/
├── config.ts              # Zod-validated environment config
├── index.ts               # Entry point — starts server + scheduler
├── core/
│   ├── browser.ts         # Playwright singleton with anti-detection patches
│   ├── rateLimit.ts       # Token-bucket rate limiter with exponential backoff
│   ├── humanize.ts        # Human behaviour simulation (delays, scrolling)
│   ├── brandFilter.ts     # Keyword filtering (strict / balanced modes)
│   ├── googleSheets.ts    # Google Sheets export service
│   └── logger.ts          # Winston structured logger
├── db/
│   ├── schema.ts          # SQLite DDL + WAL setup
│   └── queries.ts         # Typed DAO layer (prepared statements)
├── scrapers/
│   ├── base.ts            # Base scraper — cursor & log management
│   ├── reddit.ts          # Reddit scraper (multi-phase)
│   ├── playstore.ts       # Google Play scraper (Playwright)
│   ├── appstore.ts        # App Store scraper (RSS + Playwright)
│   └── run.ts             # CLI scrape runner
├── scheduler/
│   └── jobs.ts            # node-cron job definitions with concurrency guard
└── web/
    ├── server.ts          # Express app — all routes and middleware
    ├── public/            # Static CSS/JS assets
    └── views/             # EJS server-side templates
        ├── layout.ejs
        ├── dashboard.ejs
        ├── mentions.ejs
        ├── reviews.ejs
        ├── inbox.ejs
        ├── compare.ejs
        ├── report.ejs
        ├── projects.ejs
        ├── project_detail.ejs
        ├── outreach.ejs
        └── logs.ejs
data/
└── monitor.db             # SQLite database (auto-created on first run)
docs/
├── ARCHITECTURE.md        # Backend design, DB schema, fault-tolerance
├── SCRAPING.md            # Anti-detection, rate limiting, cursor logic
├── OPERATIONS.md          # Dashboard guide and full API reference
└── TECH_STACK.md          # Engineering decisions and trade-offs
```

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [Architecture](./docs/ARCHITECTURE.md) | System design, data flow, and fault-tolerance patterns |
| [Scraping](./docs/SCRAPING.md) | Anti-detection, rate limiting, and incremental cursor logic |
| [Operations](./docs/OPERATIONS.md) | Full dashboard guide and API reference |
| [Tech Stack](./docs/TECH_STACK.md) | Engineering decisions and trade-offs |

---

## 🤝 Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change. For significant changes, branch off `main` and submit a pull request.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'feat: add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

---

## 📄 License

Licensed under the **MIT License**. See [LICENSE.md](./LICENSE.md) for the full text.
