# Social Media Brand Monitor

> **Autonomous brand intelligence, response management & community outreach platform**

![License: PolyForm Noncommercial](https://img.shields.io/badge/License-PolyForm%20Noncommercial-blue.svg)
![Node: 20+](https://img.shields.io/badge/Node-20%2B-green.svg)
![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)
![SQLite](https://img.shields.io/badge/Database-SQLite%20WAL-orange.svg)

A production-ready system that autonomously monitors brand mentions across Reddit, Google Play, and the Apple App Store, analyzes sentiment, fires configurable alerts with webhook notifications, manages your response inbox, tracks competitors, and produces weekly digest reports — all from a single local dashboard.

---

## ✨ Feature Highlights

### Core Intelligence
| Feature | Description |
|---------|-------------|
| 🌐 **Multi-Platform Monitoring** | Reddit keyword search + subreddit crawling, Google Play reviews, Apple App Store reviews |
| 🧠 **AFINN-165 Sentiment** | Every mention and review automatically classified as Positive / Neutral / Negative |
| 🔔 **Configurable Alerts** | Mention-spike and negative-sentiment-spike rules per project, with enable/disable toggle |
| 🏷️ **Projects & Keyword Groups** | Scope monitoring to named projects with keyword groups, competitor entities, and per-project rules |

### Workflow & Response Management
| Feature | Description |
|---------|-------------|
| 📭 **Response Inbox** | Bookmark mentions (⭐) and flag them for action (🔔); triage with Open → In Progress → Resolved workflow and internal notes |
| 📡 **Webhook Notifications** | When an alert fires, POST to a Slack, Discord, or any HTTP endpoint automatically |
| 📤 **Reddit Outreach** | Connect via OAuth 2.0 and publish drafted posts to target subreddits with a full audit trail |

### Analytics & Reporting
| Feature | Description |
|---------|-------------|
| 🔭 **Competitor Comparison** | Side-by-side mention volume, 7d/30d trends, and sentiment split for every tracked entity |
| 📊 **Weekly Digest Report** | Stakeholder-ready weekly summary: KPIs, daily bar chart, platform breakdown, top mentions, low-rated reviews |
| 📈 **Sentiment Summary API** | Rolling-window percentages + day-by-day trend data |
| 🔍 **Global Search** | Search across mentions *and* reviews simultaneously from the header bar or via API |
| 📦 **Flexible Exports** | CSV, JSON, combined export, and Google Sheets sync |

---

## 🛠️ Prerequisites

- **OS**: macOS, Linux, or Windows (WSL2 recommended)
- **Node.js**: v20.0 or higher
- **npm**: bundled with Node.js
- **RAM**: 4 GB minimum (8 GB recommended for Playwright)

---

## 📥 Installation

```bash
# 1. Clone
git clone https://github.com/Krishnav1237/Social-Media-Brand-Monitoring.git
cd Social-Media-Brand-Monitoring

# 2. Install dependencies
npm install

# 3. Install Chromium for Playwright
npx playwright install chromium

# 4. Configure environment
cp .env.example .env
# Edit .env with your brand keywords and app IDs

# 5. Build TypeScript
npm run build

# 6. Start (web server + scheduler)
npm start
```

Open **http://localhost:3000** in your browser.

---

## ⚙️ Configuration (`.env`)

### Core Settings
| Variable | Description | Example |
|----------|-------------|---------|
| `APP_NAME` | Dashboard title | `Acme Monitor` |
| `PORT` | Web server port | `3000` |
| `LOG_LEVEL` | Logging verbosity (`error`/`warn`/`info`/`debug`) | `info` |
| `SEARCH_TERMS` | Comma-separated keywords to search | `acme,acme app,acme.io` |
| `REQUIRED_TERMS` | At least one must appear in a mention to store it | `acme.io,acme.com` |
| `FILTER_STRICT` | Only keep mentions matching `REQUIRED_TERMS` exactly | `false` |
| `FILTER_BALANCED` | Contextual match (app/game/brand context) when strict=false | `true` |
| `MONITOR_SUBREDDITS` | Subreddits where **all** posts are captured | `acme,acmegaming` |

> **Legacy aliases**: `BRAND_REQUIRED_TERMS`, `BRAND_STRICT`, `BRAND_BALANCED`, `BRAND_SUBREDDITS` are also accepted.

### App Store IDs
| Variable | Description | How to find |
|----------|-------------|-------------|
| `PLAYSTORE_APP_ID` | Package name | URL `id=com.example.app` segment |
| `APPSTORE_APP_ID` | Numerical App ID | URL `/id1234567890` segment |

### Reddit Outreach (OAuth)
Create a Reddit app at <https://www.reddit.com/prefs/apps> (type: **web app**, redirect URI: `http://localhost:3000/outreach/auth/callback`).

| Variable | Description |
|----------|-------------|
| `REDDIT_CLIENT_ID` | Your Reddit app's client ID |
| `REDDIT_CLIENT_SECRET` | Your Reddit app's client secret |
| `REDDIT_REDIRECT_URI` | Must match app setting (`http://localhost:3000/outreach/auth/callback`) |
| `REDDIT_USER_AGENT` | User-Agent string (e.g. `MyMonitor/1.0`) |

### Google Sheets Export (Optional)
| Variable | Description |
|----------|-------------|
| `GOOGLE_SHEETS_ENABLED` | Set `true` to enable |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Path to service-account credential file |
| `GOOGLE_SPREADSHEET_ID` | Sheet ID from the URL |

### Scheduling (Cron syntax)
```ini
REDDIT_CRON="0 */4 * * *"      # Every 4 hours
PLAYSTORE_CRON="0 */3 * * *"   # Every 3 hours
APPSTORE_CRON="0 */3 * * *"    # Every 3 hours
```

### Browser Controls
```ini
HEADLESS=true    # false to watch the browser for debugging
SLOWMO=0         # ms between Playwright actions (increase for slower connections)
```

---

## 🖥️ Usage

### Start the System
```bash
npm start        # web server + scheduler (production)
npm run dev      # tsx watch mode (development, auto-reloads on file changes)
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
| `/` | Overview — sentiment health bar, metrics cards, and activity feed |
| `/mentions` | Filterable Reddit mention feed with CSV/JSON export and inline bookmark/flag buttons |
| `/reviews` | App store reviews with rating and sentiment filters |
| `/inbox` | Response inbox — all bookmarked and action-required mentions with status workflow and notes |
| `/compare` | Competitor comparison — side-by-side mention volume, trends, and sentiment for all tracked entities |
| `/report` | Weekly digest report — KPIs, daily chart, platform breakdown, top mentions, and low-rated reviews |
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
| `GET` | `/api/health` | Liveness probe — returns `{"status":"ok", ...}` |
| `GET` | `/api/search?q=<term>` | Cross-table search (mentions + reviews simultaneously) |
| `GET` | `/api/sentiment/summary` | Positive/negative/neutral percentages + daily trend (`?days=30`) |
| `GET` | `/api/compare` | Entity comparison — mention volume, 7d/30d delta, and sentiment per tracked entity (`?projectId=&days=30`) |
| `GET` | `/api/report/weekly` | Weekly digest JSON — KPIs, daily chart, platform split, top mentions, low-rated reviews (`?weeksAgo=0`) |

### Response Inbox

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/inbox` | All bookmarked or action-required mentions with status |
| `POST` | `/mentions/:id/bookmark` | Toggle bookmark flag on a mention |
| `POST` | `/mentions/:id/action` | Toggle action-required flag on a mention |
| `POST` | `/mentions/:id/status` | Update triage status (`open` / `in_progress` / `resolved`) |
| `POST` | `/mentions/:id/notes` | Save internal notes on a mention |

### Exports

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/export/mentions` | Mentions as CSV |
| `GET` | `/api/export/mentions.json` | Mentions as JSON attachment |
| `GET` | `/api/export/reviews` | Reviews as CSV |
| `GET` | `/api/export/reviews.json` | Reviews as JSON attachment |
| `GET` | `/api/export/all` | Combined mentions + reviews as a single CSV |
| `GET` | `/api/export/sheets?type=mentions\|reviews` | Push to Google Sheets (requires configuration) |

### Outreach

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/outreach` | Outreach dashboard |
| `GET` | `/outreach/auth` | Start Reddit OAuth flow |
| `GET` | `/outreach/auth/callback` | OAuth callback (handled automatically) |
| `POST` | `/outreach/auth/disconnect` | Remove stored Reddit tokens |
| `POST` | `/outreach/subreddits` | Add target subreddit |
| `POST` | `/outreach/subreddits/:id/toggle` | Enable/disable subreddit |
| `POST` | `/outreach/subreddits/:id/delete` | Remove subreddit |
| `POST` | `/outreach/drafts` | Create draft post |
| `POST` | `/outreach/drafts/:id/submit` | Publish draft to Reddit |
| `POST` | `/outreach/drafts/:id/delete` | Delete draft |
| `GET` | `/api/outreach/drafts/:id/attempts` | Post attempt audit log |

---

## 🔍 Troubleshooting

| Problem | Solution |
|---------|----------|
| **Playwright launch fails** | Run `npx playwright install chromium` — the Chromium binary may not be downloaded yet |
| **"Rate Limit Exceeded"** | Increase the cron interval in `.env` or add proxy credentials. The system auto-backs-off, but a longer interval prevents repeated bursts |
| **"Database Locked"** | Close any SQLite GUI tool that has `data/monitor.db` open, then restart. WAL mode handles most concurrency, but exclusive GUI locks cause this error |
| **Dashboard not loading** | Run `npm run build` to regenerate `dist/`. In development use `npm run dev` |
| **Reddit Outreach — "Invalid OAuth state"** | OAuth states expire after 10 minutes. Start the flow again from `/outreach` |
| **No data showing** | Check the Logs page for red "Failed" entries. Verify your `REQUIRED_TERMS` are not too strict |
| **Webhook not firing** | Ensure the webhook URL is saved on the alert rule. Check your Slack/Discord app has incoming webhooks enabled |

---

## 📁 Project Structure

```
src/
├── config.ts              # Zod-validated env config (single source of truth)
├── index.ts               # Entry point — starts server + scheduler
├── core/
│   ├── browser.ts         # Playwright singleton with anti-detection
│   ├── rateLimit.ts       # Token-bucket rate limiter
│   ├── humanize.ts        # Human behaviour simulation helpers
│   ├── brandFilter.ts     # Keyword/required-term filtering logic
│   ├── googleSheets.ts    # Sheets export service
│   └── logger.ts          # Winston logger
├── db/
│   ├── schema.ts          # SQLite DDL + migrations
│   └── queries.ts         # All DB query functions (typed)
├── scrapers/
│   ├── base.ts            # BaseScraper with cursor/log management
│   ├── reddit.ts          # Reddit scraper (old.reddit.com)
│   ├── playstore.ts       # Google Play scraper (Playwright)
│   ├── appstore.ts        # App Store scraper (RSS + Playwright)
│   └── run.ts             # CLI scrape runner
├── scheduler/
│   └── jobs.ts            # node-cron job definitions
└── web/
    ├── server.ts          # Express app — all routes
    ├── public/            # CSS/JS static assets
    └── views/             # EJS templates
        ├── layout.ejs
        ├── dashboard.ejs
        ├── mentions.ejs
        ├── reviews.ejs
        ├── inbox.ejs       # Response inbox (bookmark, flag, triage)
        ├── compare.ejs     # Competitor comparison
        ├── report.ejs      # Weekly digest report
        ├── projects.ejs
        ├── project_detail.ejs
        ├── outreach.ejs    # Reddit outreach module
        └── logs.ejs
data/
└── monitor.db             # SQLite database (auto-created)
docs/
├── 01_SYSTEM_ARCHITECTURE_AND_RELIABILITY_ENGINEERING.md
├── 02_SCRAPING_INTELLIGENCE_AND_STRATEGY.md
├── 03_USER_OPERATIONS_MANUAL.md
└── TECH_STACK_INTERVIEW_GUIDE.md
```

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [System Architecture](./docs/01_SYSTEM_ARCHITECTURE_AND_RELIABILITY_ENGINEERING.md) | Backend design, DB schema, and fault-tolerance patterns |
| [Scraping Strategies](./docs/02_SCRAPING_INTELLIGENCE_AND_STRATEGY.md) | Anti-detection, rate limiting, and cursor logic |
| [User Operations Manual](./docs/03_USER_OPERATIONS_MANUAL.md) | Full dashboard guide and API reference |
| [Tech Stack Guide](./docs/TECH_STACK_INTERVIEW_GUIDE.md) | Engineering decisions and trade-offs |

---

## 📄 License

Licensed under the **PolyForm Noncommercial License 1.0.0**. See [LICENSE.md](./LICENSE.md).
