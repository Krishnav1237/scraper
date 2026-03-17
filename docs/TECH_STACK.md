# Tech Stack & Engineering Guide

> **Scope:** Technology choices, design patterns, and trade-off rationale
> **Audience:** Engineers, contributors, and technical interviewers

---

## 1. Project Overview

The **Social Media Brand Monitor** is a production-grade, self-hosted brand intelligence platform built with Node.js, TypeScript, and SQLite. It scrapes Reddit, Google Play, and the Apple App Store; classifies content with local sentiment analysis; surfaces data through a server-side rendered dashboard; and ships a full set of workflow tools — response inbox, competitor comparison, weekly digest, and community outreach.

---

## 2. Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Runtime | Node.js 20 | Non-blocking I/O ideal for concurrent scraping |
| Language | TypeScript 5 | Full type safety; Zod runtime validation at the boundary |
| Web framework | Express 4 | Minimal, stable, SSR-friendly |
| Templates | EJS | No build pipeline; data is already available server-side |
| Database | SQLite (WAL) via `better-sqlite3` | Zero-infrastructure; synchronous API; file-level backup |
| Scraping | Playwright + `playwright-extra` + stealth plugin | Reliable headless Chrome with anti-detection |
| Sentiment | AFINN-165 via `sentiment` npm | Local, offline, zero cost; extensible with custom overrides |
| Scheduling | `node-cron` | In-process scheduler; no external dependencies |
| Logging | Winston | Structured logs to console and file; configurable levels |
| Config | Zod | Schema-validated environment variables; crash-at-startup on bad config |
| Exports | `google-spreadsheet` + `googleapis` | Google Sheets integration via service-account JWT |
| Process management | PM2 (recommended) | Auto-restart, log rotation, cluster mode |

---

## 3. Architecture

The system follows a **layered monolith** pattern with a pluggable scraper interface, making it easy to add new platforms without touching existing code.

```
Controller (Express routes)
    │
    ▼
Orchestration (scheduler / job manager)
    │
    ├── Scrapers (Reddit, Play Store, App Store)
    │       └── Core utilities (browser, rate limiter, brand filter)
    │
    └── DB Layer (queries.ts — prepared statements)
            │
            ├── Sentiment Engine
            ├── Alert Engine
            └── Export Service
```

### Key Design Patterns

| Pattern | Where |
|---------|-------|
| Singleton | `browser.ts` — one Playwright instance shared across all scrapers |
| Strategy | `BaseScraper` extended by each platform scraper |
| Chain of Responsibility | Reddit scraper: JSON API → Playwright fallback → comment search |
| Retry with backoff | `rateLimit.ts` — `withRetry<T>` wraps every external call |
| Cursor / checkpoint | `scrape_cursors` table — enables stateful incremental ingestion |
| DAO | `queries.ts` — all DB access through prepared statements |

---

## 4. Project Structure

```
social-media-monitor/
├── src/
│   ├── config.ts               # Zod env validation — single source of truth
│   ├── index.ts                # Entry point: starts server + scheduler
│   ├── core/
│   │   ├── browser.ts          # Playwright singleton + stealth context factory
│   │   ├── rateLimit.ts        # Token-bucket rate limiter + exponential backoff
│   │   ├── brandFilter.ts      # Strict / balanced keyword filtering
│   │   ├── humanize.ts         # Human behaviour simulation (delays, scrolling)
│   │   ├── googleSheets.ts     # Google Sheets export service
│   │   └── logger.ts           # Winston logger (console + file)
│   ├── scrapers/
│   │   ├── base.ts             # Base scraper: cursor + log management
│   │   ├── reddit.ts           # Multi-phase Reddit scraper
│   │   ├── playstore.ts        # Google Play scraper (Playwright)
│   │   ├── appstore.ts         # App Store scraper (RSS + Playwright)
│   │   └── run.ts              # CLI entry for manual scrape runs
│   ├── db/
│   │   ├── schema.ts           # SQLite DDL + WAL init
│   │   ├── queries.ts          # Typed DAO layer
│   │   └── init.ts             # DB bootstrap script
│   └── web/
│       ├── server.ts           # Express app — routes, middleware, API
│       ├── views/              # EJS templates
│       │   ├── layout.ejs
│       │   ├── dashboard.ejs
│       │   ├── mentions.ejs
│       │   ├── reviews.ejs
│       │   ├── inbox.ejs       # Response inbox
│       │   ├── compare.ejs     # Competitor comparison
│       │   ├── report.ejs      # Weekly digest
│       │   ├── projects.ejs
│       │   ├── project_detail.ejs
│       │   ├── outreach.ejs    # Reddit outreach
│       │   └── logs.ejs
│       └── public/             # Static CSS and client-side JS
├── data/monitor.db             # SQLite database (auto-created)
├── logs/app.log                # Winston log output
├── .env                        # Runtime configuration
└── .env.example                # Configuration template
```

---

## 5. Database Design

SQLite with WAL mode handles the concurrency pattern of this system: the web server reads continuously while the scheduler writes periodically. WAL allows multiple readers without blocking a writer.

### Core Schema

```sql
-- Ingested content
CREATE TABLE mentions (
  id INTEGER PRIMARY KEY,
  platform TEXT, external_id TEXT, title TEXT, body TEXT,
  url TEXT, author TEXT, score INTEGER, created_at INTEGER,
  sentiment TEXT, sentiment_score REAL,
  -- Inbox triage columns
  bookmarked INTEGER DEFAULT 0,
  action_required INTEGER DEFAULT 0,
  action_status TEXT DEFAULT 'open',
  internal_notes TEXT,
  UNIQUE(platform, external_id)
);

CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  platform TEXT, external_id TEXT, author TEXT, rating INTEGER,
  body TEXT, version TEXT, created_at INTEGER,
  sentiment TEXT, sentiment_score REAL,
  UNIQUE(platform, external_id)
);

-- Operational tables
CREATE TABLE scrape_cursors (platform TEXT, search_term TEXT, last_id TEXT, last_fetched_at INTEGER, PRIMARY KEY(platform, search_term));
CREATE TABLE scrape_logs    (id INTEGER PRIMARY KEY, job TEXT, status TEXT, items_found INTEGER, duration_ms INTEGER, error TEXT, created_at INTEGER);

-- Projects and alerting
CREATE TABLE projects         (id INTEGER PRIMARY KEY, name TEXT, description TEXT);
CREATE TABLE keyword_groups   (id INTEGER PRIMARY KEY, project_id INTEGER, name TEXT, terms TEXT);
CREATE TABLE monitored_entities (id INTEGER PRIMARY KEY, project_id INTEGER, name TEXT, type TEXT);
CREATE TABLE alert_rules      (id INTEGER PRIMARY KEY, project_id INTEGER, metric TEXT, threshold REAL, webhook_url TEXT, enabled INTEGER DEFAULT 1);
CREATE TABLE alert_events     (id INTEGER PRIMARY KEY, rule_id INTEGER, value REAL, fired_at INTEGER);

-- Outreach
CREATE TABLE outreach_reddit_auth   (...);
CREATE TABLE outreach_subreddits    (...);
CREATE TABLE outreach_drafts        (...);
CREATE TABLE outreach_post_attempts (...);
```

---

## 6. Web Layer

### SSR Pages

| Route | Template | Description |
|-------|---------|-------------|
| `GET /` | `dashboard.ejs` | Sentiment health bar, metrics, activity feed |
| `GET /mentions` | `mentions.ejs` | Filtered mention feed with inline triage buttons |
| `GET /reviews` | `reviews.ejs` | Filtered reviews |
| `GET /inbox` | `inbox.ejs` | Response inbox (bookmark/flag/status/notes) |
| `GET /compare` | `compare.ejs` | Side-by-side entity comparison |
| `GET /report` | `report.ejs` | Weekly digest report |
| `GET /projects` | `projects.ejs` | Project / alert management |
| `GET /outreach` | `outreach.ejs` | Reddit OAuth and draft posts |
| `GET /logs` | `logs.ejs` | Scraper job history |

### REST API Summary

| Endpoint | Description |
|----------|-------------|
| `/api/stats` | Aggregate counts |
| `/api/health` | Liveness probe |
| `/api/mentions` | Paginated mentions with filters |
| `/api/reviews` | Paginated reviews with filters |
| `/api/trends` | Daily trend data |
| `/api/search` | Cross-table search |
| `/api/sentiment/summary` | Rolling-window sentiment |
| `/api/compare` | Entity comparison |
| `/api/report/weekly` | Weekly digest JSON |
| `/api/inbox` | Bookmarked / flagged mentions |
| `/api/export/*` | CSV / JSON / Google Sheets export |
| `/mentions/:id/*` | Inbox mutation endpoints |

---

## 7. Key Design Decisions

### Why SQLite instead of PostgreSQL?
- Zero infrastructure — a file, not a server. Perfect for self-hosted local deployments.
- `better-sqlite3`'s synchronous API avoids unnecessary async complexity in Express route handlers.
- WAL mode handles the write-concurrency pattern (scheduler writes; web server reads) without configuration.
- **Trade-off:** Does not horizontally scale. Intentional for local-first design. PostgreSQL migration path is straightforward (same query logic, different driver).

### Why Playwright instead of Puppeteer or Cheerio?
- Cleaner async API (`waitForSelector`, `waitForNetworkIdle`) is more reliable than manual sleep loops.
- `playwright-extra` + stealth plugin handles anti-bot patches at the library level.
- Single Chromium download managed by `npx playwright install chromium`.
- **Trade-off:** Larger binary footprint than Cheerio-only solutions.

### Why EJS instead of React/Vue?
- No build pipeline — simpler CI and deployment.
- Data is already available server-side from SQLite — no API round-trip for initial page load.
- The dashboard is read-mostly — no complex client state to manage.
- **Trade-off:** Page refreshes required for updates (no reactive UI). Acceptable for a monitoring tool where near-real-time is sufficient.

### Why not Twitter/X or LinkedIn?
- **Twitter/X:** CycleTLS fingerprinting requirements, Arkose Labs CAPTCHAs, ToS legal risk, Enterprise API pricing ($42k+/year).
- **LinkedIn:** Extremely aggressive anti-scraping, high account-ban risk, no meaningful public data endpoint.
- **Decision:** These platforms are excluded to guarantee 100% system stability. Future integration requires official API access.

### Why AFINN over an LLM?
- Fully offline — no API key, no cost, no latency.
- Deterministic — same input always produces the same result (good for reproducibility).
- Sufficient for brand monitoring at this scale where recall matters more than sarcasm detection.
- **Upgrade path:** Replace `AIAnalysisEngine` (planned Phase 3) with an LLM-backed classifier; existing DB schema and API contracts remain unchanged.

---

## 8. Data Quality — Three-Layer Funnel

```
Raw API Results
      │
      ▼
┌──────────────────────┐
│ Layer 1: ID Dedup    │  In-memory Set<string> of external_ids
│ + Content Hash       │  Prevents duplicates across phases in one run
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Layer 2: Brand Filter│  Strict anchor | Balanced keyword match
│                      │  Removes false positives before DB write
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Layer 3: DB UNIQUE   │  UNIQUE(platform, external_id)
│ constraint           │  INSERT OR IGNORE — final safety net
└──────────────────────┘
```

---

## 9. Potential Improvements

| Area | Improvement |
|------|-------------|
| **Scalability** | Replace SQLite with PostgreSQL + TimescaleDB; move scraper to a separate worker with BullMQ |
| **Real-time UI** | WebSocket push for live mention notifications (no page refresh) |
| **LLM sentiment** | Replace AFINN with an LLM classifier for sarcasm detection and aspect-based analysis |
| **Auto-reply drafts** | LLM-generated reply suggestions in the Response Inbox |
| **Containerization** | Docker Compose with multi-stage build for reproducible deployment |
| **More platforms** | YouTube comments, Google News, Trustpilot, G2 |
| **Auth** | Basic auth or SSO to protect the dashboard in shared environments |
| **Email digest** | Schedule the weekly digest to be emailed via SendGrid or Resend |
