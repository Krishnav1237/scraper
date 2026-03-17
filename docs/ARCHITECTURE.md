# Architecture & Reliability Engineering

> **Scope:** System design, automation engine, SRE patterns, and scaling roadmap
> **Audience:** Engineers and contributors

---

## 1. Overview

The Social Media Brand Monitor is a **fault-tolerant modular monolith** built for autonomous, long-running operation. It continuously ingests brand mentions from Reddit, Google Play, and the Apple App Store; classifies each one with local sentiment analysis; surfaces results through a real-time dashboard; and fires webhook alerts when configurable thresholds are crossed.

Core design principles:

- **Fail-safe by default** — every external call (network, API, browser) is wrapped in retry logic and error boundaries.
- **Strict type safety** — 100% TypeScript with Zod runtime validation; invalid config crashes at startup, not at runtime.
- **Incremental state** — scrape cursors prevent re-fetching old data, reducing bandwidth and latency.
- **Resource efficiency** — `better-sqlite3` (C++ bindings) gives high-performance local storage with no server overhead.

---

## 2. System Architecture

```mermaid
graph TD
    User[Analyst] -->|Views| Dashboard[Web Dashboard Express/EJS]
    Config[.env] -->|Validates| Zod[Zod Schema]

    subgraph "Orchestration"
        Cron[node-cron] --> Manager[Job Manager]
        Manager --> Mutex[Concurrency Lock]
    end

    subgraph "Ingestion Engine"
        Manager --> Reddit[Reddit Scraper]
        Manager --> PlayStore[Google Play Scraper]
        Manager --> AppStore[App Store Scraper]
        Reddit & PlayStore & AppStore --> Parser[Parser / Normaliser]
    end

    subgraph "Processing & Storage"
        Parser --> NLP[Sentiment Engine AFINN-165]
        NLP --> DB[(SQLite WAL)]
        DB --> State[Cursor State]
        State --> Manager
    end

    subgraph "Alert & Notification"
        DB --> AlertEngine[Alert Engine]
        AlertEngine --> Webhook[HTTP POST Slack / Discord / HTTP]
    end

    subgraph "Response & Analytics"
        Inbox[/inbox] --> DB
        Compare[/compare] --> DB
        Report[/report] --> DB
    end

    subgraph "Outreach"
        Outreach[/outreach] --> RedditOAuth[Reddit OAuth API]
        Outreach --> DB
        Outreach --> Submit[oauth.reddit.com/api/submit]
        Submit --> DB
    end

    Dashboard --> DB
    Dashboard --> Export[Export Service]
    Export --> Sheets[Google Sheets API]
```

---

## 3. Source Layout

### `src/config.ts` — Central Config
Single source of truth. Loads `process.env`, validates against a Zod schema, and exports a fully-typed `config` object. The app crashes immediately on invalid config, preventing undefined behaviour downstream.

### `src/web/` — Presentation Layer
- **`server.ts`** — Express application; sets up middleware, static serving, and all API routes.
- **`views/`** — EJS server-side templates. Logic is kept minimal (data iteration, conditional rendering).
- **`public/js/main.js`** — Progressive enhancement: debounced search (600ms), form validation, loading feedback.
- **`public/css/`** — Tiered CSS architecture (`reset → variables → layout → components → utilities`).

### `src/core/` — Shared Utilities
- **`browser.ts`** — Playwright singleton with SIGINT/SIGTERM cleanup and stealth patches. Implements the Singleton pattern to prevent resource exhaustion.
- **`rateLimit.ts`** — Generic `withRetry<T>` with exponential backoff.
- **`brandFilter.ts`** — Balanced/strict keyword filtering logic.

### `src/db/` — Persistence Layer
- **`schema.ts`** — All DDL + WAL mode setup.
- **`queries.ts`** — Typed DAO layer using prepared statements. Covers all CRUD, inbox triage, competitor comparison, weekly digest, and outreach.

**Core tables:** `mentions`, `reviews`, `scrape_logs`, `scrape_cursors`

**Project tables:** `projects`, `keyword_groups`, `monitored_entities`, `alert_rules` (includes `webhook_url`), `alert_events`

**Outreach tables:** `outreach_reddit_auth`, `outreach_oauth_states`, `outreach_subreddits`, `outreach_drafts`, `outreach_post_attempts`

**Inbox columns on `mentions`:** `bookmarked`, `action_required`, `action_status`, `internal_notes`

### `src/scrapers/` — Ingestion
Each scraper extends `BaseScraper`, which handles cursor loading/saving and log creation. Scrapers are intentionally isolated — a failure in one never affects another.

---

## 4. Frontend Architecture

The UI is **server-side rendered (SSR)** with **progressive enhancement**.

- Express renders EJS templates. The browser receives fully-formed HTML — fast first contentful paint, zero JS required for core functionality.
- `main.js` adds interactivity: debounced auto-search, loading states, form feedback.
- **URL as state** — all filters are query params (`?search=foo&sentiment=negative`). Any view is bookmarkable and shareable by copying the URL.
- **Mobile-first CSS** — CSS Grid and Flexbox with media queries; no fixed heights.

---

## 5. Reliability Engineering

### Automation Engine
Centralized in `src/scheduler/jobs.ts`. Uses an in-memory `Set<string>` as a mutex — if a job is already running, the next trigger is skipped to prevent memory pressure.

### Error Recovery Levels

| Level | Example | Action |
|-------|---------|--------|
| **1 — Item error** | Malformed HTML on one review | Log warning, skip item, continue batch |
| **2 — Scraper error** | Reddit API 503 | Exponential backoff (max 3 retries); abort run if all fail; keep app alive |
| **3 — Process crash** | Unhandled exception | Log to `logs/fatal.log`; exit with code 1; PM2 / Docker auto-restarts |

### Browser Lifecycle
Headless browsers can become zombie processes. `browser.ts` enforces a 60-second page-load timeout and forcefully closes all browser contexts on shutdown.

---

## 6. Deployment

### PM2 (Recommended)

```bash
npm install -g pm2
npm run build
pm2 start dist/index.js --name social-monitor
pm2 save && pm2 startup
```

PM2 provides auto-restart on crash, log rotation, and CPU/memory monitoring via `pm2 monit`.

### Docker

```dockerfile
FROM node:20-slim
RUN npx playwright install-deps
WORKDIR /app
COPY . .
RUN npm ci && npm run build
CMD ["node", "dist/index.js"]
```

### Database Backup

The SQLite database is a single file (`data/monitor.db`). Back it up by copying the file — safe at runtime due to WAL mode. Restore by overwriting and restarting.

---

## 7. Roadmap

### Completed
- ✅ Reddit Outreach — OAuth 2.0 flow, subreddit management, draft posts, audit trail
- ✅ Projects & Alert Rules — keyword groups, competitor entities, configurable thresholds
- ✅ Webhook Notifications — Slack, Discord, and generic HTTP delivery
- ✅ Response Inbox — bookmark, flag, triage (Open → In Progress → Resolved), internal notes
- ✅ Competitor Comparison — side-by-side volume, 7d/30d trends, sentiment split
- ✅ Weekly Digest Report — KPIs, daily bar chart, platform breakdown, top content
- ✅ Enhanced API — `/api/health`, `/api/search`, `/api/sentiment/summary`, `/api/compare`, `/api/report/weekly`
- ✅ Dashboard Sentiment Health Bar

### Phase 3 — AI Integration
- LLM-backed sentiment (sarcasm detection, aspect-based analysis)
- Auto-reply draft suggestions in the Response Inbox

### Phase 4 — Distributed Scaling
- Replace internal scheduler with **Redis + BullMQ** for parallel worker nodes
- Migrate to **PostgreSQL + TimescaleDB** for millions-of-rows scale
- BrightData SDK integration for automatic IP rotation
