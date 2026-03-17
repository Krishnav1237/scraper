# Social Media Brand Monitor — Tech Stack & Engineering Guide

> A comprehensive breakdown of tech stack, system design, architecture decisions, and engineering rationale for the **Social Media Brand Monitor**.

---

## 1. Project Overview

The **Social Media Brand Monitor** is a production-grade, self-hosted brand intelligence platform. It autonomously scrapes brand mentions from **Reddit**, aggregates app reviews from the **Google Play Store** and **Apple App Store**, runs **local sentiment analysis**, and surfaces everything through a real-time **web dashboard** — with a full response inbox, competitor comparison, weekly digest reports, and community outreach tools built in.

**Key constraints that drove design:**
- No official platform APIs (Reddit public JSON, RSS feeds)
- No cloud infrastructure — runs entirely on Node.js locally
- No account bans / legal risk (Twitter/LinkedIn explicitly excluded)
- Must handle incremental data without re-scraping everything each time

---

## 2. Full Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Language** | TypeScript 5.4 (ESM) | Type safety, modern async/await, great Node.js ecosystem |
| **Runtime** | Node.js 20+ | Native ESM, stable Fetch API, LTS support |
| **Dev Runner** | `tsx watch` | Zero-config TS execution, hot reload for development |
| **Build** | `tsc` | Compile to `dist/` for production use via `node dist/index.js` |
| **Web Framework** | Express.js 4 | Lightweight, minimal, widely understood |
| **Templating** | EJS | Server-side rendering, no frontend build step; avoids React overhead |
| **Database** | SQLite (better-sqlite3) | Zero-config, file-based, synchronous API = simpler code, WAL mode for concurrency |
| **Browser Automation** | Playwright (Chromium) | Faster than Puppeteer, built-in stealth surface, better async API |
| **Stealth Layer** | `playwright-extra` + `puppeteer-extra-plugin-stealth` | Erases automation fingerprints that sites detect |
| **Sentiment Analysis** | `sentiment` (AFINN-165 lexicon) | Fully offline, no API cost, extensible with custom lexicons |
| **Scheduling** | `node-cron` | Standard cron expressions, lightweight, process-level |
| **Logging** | `winston` | Structured JSON logs, multi-transport (console + file) |
| **HTTP Client** | Native `fetch` (Node 20) | No extra dependency; axios used for Play Store library |
| **Schema Validation** | `zod` | Runtime validation of environment config at startup |
| **Google Sheets** | `google-spreadsheet` + `googleapis` | One-click export to Google Sheets for stakeholders |
| **App Review Scraping** | `google-play-scraper` | npm library wrapping Play Store's internal JSON API |
| **Testing** | `vitest` | Vite-native, fast unit tests |

---

## 3. System Architecture

### High-Level Data Flow

```mermaid
flowchart TD
    subgraph Input Sources
        A[Reddit JSON API]
        B[Pushshift / PullPush Archive]
        C[Google Play Store]
        D[Apple App Store RSS]
        E[Browser - Playwright]
    end

    subgraph Core Engine
        F[Rate Limiter\nToken Bucket + Backoff]
        G[Brand Filter\nRegex + Anchor Match]
        H[Sentiment Pipeline\nAFINN-165]
        I[Deduplication\nID + Content Hash]
    end

    subgraph Persistence
        J[(SQLite WAL\nmonitor.db)]
    end

    subgraph Scheduler
        K[node-cron\nCron Jobs]
    end

    subgraph Web Layer
        L[Express Server]
        M[EJS Dashboard]
        N[REST API + CSV Export]
        O[Google Sheets Export]
    end

    A --> F --> G --> I --> H --> J
    B --> F
    C --> J
    D --> J
    E --> G --> I
    K --> |triggers| A
    K --> |triggers| C
    K --> |triggers| D
    J --> L --> M
    L --> N
    L --> O
```

### Project Directory Structure

```
social-media-monitor/
├── src/
│   ├── config.ts               # Central config + zod env validation
│   ├── index.ts                # Entry point: starts server + scheduler
│   ├── core/
│   │   ├── browser.ts          # Playwright singleton + stealth context factory
│   │   ├── rateLimit.ts        # Token-bucket rate limiter (global)
│   │   ├── brandFilter.ts      # Brand anchor matching + exclusion regex
│   │   ├── humanize.ts         # Human behavior simulation (typing, scrolling)
│   │   ├── googleSheets.ts     # Google Sheets API integration
│   │   └── logger.ts           # Winston logger (console + file)
│   ├── scrapers/
│   │   ├── reddit.ts           # 5-phase Reddit scraper (primary)
│   │   ├── playstore.ts        # Play Store review scraper
│   │   ├── appstore.ts         # App Store RSS scraper
│   │   └── run.ts              # CLI entry for manual scrape runs
│   ├── db/
│   │   ├── schema.ts           # SQLite schema + WAL init
│   │   ├── queries.ts          # All DB queries (read/write)
│   │   └── init.ts             # DB bootstrap script
│   └── web/
│       ├── server.ts           # Express app, routes, API endpoints
│       ├── views/              # EJS templates
│       │   ├── dashboard.ejs
│       │   ├── mentions.ejs
│       │   ├── reviews.ejs
│       │   ├── inbox.ejs       # Response inbox (bookmark, flag, triage)
│       │   ├── compare.ejs     # Competitor comparison
│       │   ├── report.ejs      # Weekly digest report
│       │   ├── projects.ejs
│       │   ├── project_detail.ejs
│       │   ├── outreach.ejs
│       │   └── logs.ejs
│       └── public/             # CSS, client-side JS, assets
├── data/monitor.db             # SQLite database file
├── logs/app.log                # Winston log file
└── .env                        # Runtime configuration
```

---

## 4. Module Deep-Dives

### 4.1 Configuration System (`config.ts` + `zod`)

All runtime parameters are parsed from `.env` at startup using **Zod schemas**. The app fails fast with a clear error message if required variables are missing or malformed.

Key config groups:
- **Brand filters** — `SEARCH_TERMS`, `BRAND_REQUIRED_TERMS`, `BRAND_STRICT`, `BRAND_BALANCED`
- **Cron schedules** — `REDDIT_CRON`, `PLAYSTORE_CRON`, `APPSTORE_CRON`
- **App IDs** — `PLAYSTORE_APP_ID`, `APPSTORE_APP_ID`
- **Browser** — `HEADLESS`, `SLOWMO`, proxy settings
- **Google integration** — `GOOGLE_SHEETS_ENABLED`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SPREADSHEET_ID`

**Design rationale:** Centralizing config validation in one place prevents silent failures from misconfiguration.

---

### 4.2 Reddit Scraper — 5-Phase Architecture (`reddit.ts`)

The Reddit scraper is the most sophisticated module. It uses a **multi-phase, exhaustive strategy** to ensure no mention is missed.

| Phase | Method | What it does |
|---|---|---|
| **Phase 0** | `reddit.com/r/{sub}` listings | Fetches ALL posts + comments in brand-owned subreddits |
| **Phase 1** | `reddit.com/search.json` | Exhaustive keyword combinations × sort modes × time filters × pagination |
| **Phase 2** | Per-subreddit restricted search | Searches targeted subreddits relevant to your brand/industry |
| **Phase 3** | Comment-specific search (`type=comment`) | Catches brand mentions buried in comment threads |
| **Phase 4** | Pushshift/PullPush archive API | Retrieves historical data (skipped in incremental runs) |
| **Phase 5** | Playwright browser verification | Visual scroll + DOM extraction as a final cross-check |

**Incremental vs. Full mode:** The scraper checks `scrape_cursors`. If a cursor exists, it runs phases 0-3 with narrow time filters (`day`/`week`), completing in ~5 minutes instead of ~10.

**Search term expansion:** Your `SEARCH_TERMS` are automatically expanded into multiple variations (`"brand"`, `"brand app"`, `"brand.io"`, `"brand android"`, etc.) to maximize coverage.

---

### 4.3 Rate Limiting — Token Bucket Algorithm (`rateLimit.ts`)

The system implements a **Token Bucket** with **exponential backoff** per platform:

```
┌─────────────────────────────────────────────────┐
│ Token Bucket (per platform)                     │
│  maxTokens: 10                                  │
│  refillRate: rpm / 60 tokens/sec                │
│  backoffMultiplier: 1x → 10x (on failures)     │
│                                                 │
│  Request → consume 1 token                      │
│  If tokens < 1 → wait (tokensNeeded/rate) ms   │
│  + random jitter (500–2000ms per request)       │
│                                                 │
│  On HTTP 429 → drain tokens + multiply backoff  │
│  On success  → backoff *= 0.9 (slowly recover)  │
└─────────────────────────────────────────────────┘
```

The Reddit scraper uses its **own embedded** `ProductionRateLimiter` class set at **25 req/min** (conservative), with a separate global `rateLimit.ts` for the Play Store and App Store scrapers.

**Key design choice:** Jitter (random delay 500–1500ms per request) prevents the system from looking like a bot with perfectly regular request intervals.

---

### 4.4 Anti-Detection & Browser Stealth (`browser.ts`)

Playwright launches Chromium with every known bot-detection bypass:

**Chrome flags:**
```
--disable-blink-features=AutomationControlled
--disable-dev-shm-usage
--no-sandbox
--disable-gpu
```

**Context-level spoofing (injected into every page):**
- `navigator.webdriver` → `undefined` (hides Selenium/Playwright flag)
- `navigator.plugins` → fake array of 5 plugins
- `navigator.platform` → randomized `Win32` or `MacIntel`
- `navigator.hardwareConcurrency` → random from `[4, 8, 12, 16]`
- `navigator.deviceMemory` → random `4` or `8`
- `window.chrome.runtime` → stub object
- `permissions.query` notifications → bypass

**Randomization per session:**
- Viewport from 4 common HD resolutions (random pick)
- User-Agent from 4 real browser strings (random pick)
- Timezone fixed to `America/New_York`
- Geolocation: New York City

**Cookie persistence:** Session cookies are saved to `cookies/{platform}.json` and reloaded on the next launch, maintaining session continuity.

---

### 4.5 Brand Filter (`brandFilter.ts`)

A multi-strategy relevance system protects data quality:

**Strategy 1 — Strict Mode (`FILTER_STRICT=true`):**
Only saves content containing at least one brand anchor (e.g., `yourbrand.com`, `yourbrand.io`).

**Strategy 2 — Balanced Mode (`FILTER_BALANCED=true`):**
Keeps mentions with your brand keyword if they also contain app context words (`app`, `game`, `android`, `ios`, `download`, `puzzle`, etc.).

**Exclusion patterns:** Add custom regex exclusions in `brandFilter.ts` to eliminate noise from unrelated uses of your keyword (other brands, slang, foreign languages, etc.).

This is critical for any short or common keyword where your brand name coincidentally appears in unrelated contexts.

---

### 4.6 Sentiment Analysis Pipeline (`pipeline/`)

The sentiment engine runs **100% locally** with zero API cost:

1. **Library:** `sentiment` npm package (AFINN-165 word list)
2. **Custom lexicon:** `lexicon.ts` overrides/extends AFINN with social media terms (`"love"`, `"bug"`, `"crash"`, `"amazing"`, `"terrible"`, etc.)
3. **Normalization:** Raw `result.comparative` (average score per word) → clamped to `[-1, 1]`
4. **Labels:**
   - `score >= 0.1` → **positive**
   - `score <= -0.1` → **negative**
   - else → **neutral**
5. **Confidence heuristic:** `min(1, |score| + tokens.length × 0.05)` — longer texts with strong signals score higher confidence

Every mention and review is tagged at scrape time. The dashboard can filter by sentiment label in real time.

---

### 4.7 Database Design (`schema.ts`)

SQLite with **WAL (Write-Ahead Logging)** mode for concurrent read/write without locking.

#### Core Tables

**`mentions`** — Reddit posts and comments
```sql
id, platform_id, external_id (UNIQUE), author, author_url,
content, url, engagement_likes, engagement_comments, engagement_shares,
sentiment_score, sentiment_label, created_at, scraped_at
```

**`reviews`** — Play Store & App Store reviews
```sql
id, platform_id, external_id (UNIQUE), author, rating, title, content,
app_version, helpful_count, developer_reply,
sentiment_score, sentiment_label, review_date, scraped_at
```

**`scrape_cursors`** — Incremental scraping state
```sql
platform (PK), last_scraped_at, last_item_date, last_item_ids, updated_at
```

**`scrape_logs`** — Job audit trail
```sql
id, platform, status, items_found, items_new, error, started_at, completed_at
```

**Outreach tables** (compliance-first Reddit posting helper):
- `outreach_reddit_auth` — OAuth token store
- `outreach_subreddits` — target subreddits + cooldown settings
- `outreach_drafts` — draft posts for human review before submission
- `outreach_post_attempts` — audit log of post attempts

**Inbox columns on `mentions`** (response triage):
- `bookmarked` — boolean flag for saved mentions
- `action_required` — boolean flag for items needing a response
- `action_status` — `open` / `in_progress` / `resolved`
- `internal_notes` — private team notes

**Alert rules** include a `webhook_url` column — when an alert fires, the system POSTs a payload to this URL (auto-formats for Slack, Discord, or generic HTTP).

#### Indexes
```sql
idx_mentions_platform, idx_mentions_created, idx_mentions_sentiment
idx_reviews_platform, idx_reviews_date, idx_reviews_rating
```

**Design rationale:** SQLite was chosen because the system runs locally, data volumes are in the thousands-to-hundreds-of-thousands range (not millions), and a file-based DB eliminates server setup completely. WAL mode handles the concurrency between the web server (readers) and scheduler (writers).

---

### 4.8 Scheduler (`jobs.ts`)

Jobs are registered as an array of `ScheduledJob` objects and started with `node-cron`:

```typescript
// Concurrency guard — prevents overlap if a job runs long
if (runningJobs.has(job.name)) {
  logger.warn(`Skipping ${job.name} (previous run still active)`);
  return;
}
```

| Job | Default Cron | Guard |
|---|---|---|
| Reddit Scraper | `0 */4 * * *` (every 4h) | Always enabled |
| Play Store | `0 */6 * * *` (every 6h) | Only if `PLAYSTORE_APP_ID` set |
| App Store | `0 */6 * * *` (every 6h) | Only if `APPSTORE_APP_ID` set |

**Graceful shutdown:** `SIGINT`/`SIGTERM` handlers close the browser before exiting.

---

### 4.9 Web Server & API (`server.ts`)

A standard Express.js app with server-side rendering via EJS templates.

#### Pages (SSR)
| Route | Template | Description |
|---|---|---|
| `GET /` | `dashboard.ejs` | Stats, sentiment health bar, recent mentions, recent reviews, logs |
| `GET /mentions` | `mentions.ejs` | Filtered mentions feed with inline bookmark / flag buttons |
| `GET /reviews` | `reviews.ejs` | Filtered reviews table |
| `GET /inbox` | `inbox.ejs` | Response inbox — bookmarked/flagged mentions with triage status and notes |
| `GET /compare` | `compare.ejs` | Side-by-side entity comparison (volume, trends, sentiment) |
| `GET /report` | `report.ejs` | Weekly digest report with KPIs, daily chart, and top content |
| `GET /projects` | `projects.ejs` | Project management, keyword groups, entities, alert rules |
| `GET /outreach` | `outreach.ejs` | Reddit OAuth, target subreddits, draft posts |
| `GET /logs` | `logs.ejs` | Last 100 `scrape_logs` |

#### REST API
| Endpoint | Method | Description |
|---|---|---|
| `/api/stats` | GET | Aggregate counts, averages |
| `/api/mentions` | GET | Paginated JSON list with filters |
| `/api/reviews` | GET | Paginated JSON list with filters |
| `/api/trends` | GET | Day-by-day mention trend |
| `/api/health` | GET | Liveness probe |
| `/api/search` | GET | Cross-table search (mentions + reviews) |
| `/api/sentiment/summary` | GET | Sentiment percentages + daily trend |
| `/api/compare` | GET | Side-by-side entity stats |
| `/api/report/weekly` | GET | Weekly digest JSON |
| `/api/inbox` | GET | Bookmarked / action-required mentions |
| `/api/status` | GET | Uptime, cron schedules, rate-limit state, recent logs |
| `/api/export/mentions` | GET | Download mentions as CSV |
| `/api/export/reviews` | GET | Download reviews as CSV |
| `/api/export/all` | GET | Download combined CSV |
| `/api/export/sheets?type=...` | GET | Push to Google Sheets |
| `/mentions/:id/bookmark` | POST | Toggle bookmark flag |
| `/mentions/:id/action` | POST | Toggle action-required flag |
| `/mentions/:id/status` | POST | Update triage status |
| `/mentions/:id/notes` | POST | Save internal notes |

**URL-based filtering:** All filters use query params (`?platform=reddit&sentiment=negative&search=bug`). This makes filtered views shareable by copying the URL.

---

## 5. Key Design Decisions & Trade-offs

### Why SQLite over PostgreSQL?
- Zero infrastructure: just a file → perfect for an MVP running locally
- `better-sqlite3`'s **synchronous API** avoids async complexity for DB reads in Express route handlers
- WAL mode handles the write contention between scraper (writer) and web server (reader)
- Trade-off: doesn't horizontally scale, but this is intentional for local-first design

### Why Playwright over Puppeteer or Selenium?
- **Built-in stealth base**: Chromium args + script injection is cleaner
- **Better async API**: `page.evaluate()`, `waitFor*` methods are more reliable
- **Single binary**: Playwright manages its own Chromium download (`npx playwright install chromium`)
- Trade-off: larger download size

### Why EJS over React/Vue?
- No build pipeline → simpler deployment
- Data already available server-side from SQLite → no API round-trip for initial page load
- The dashboard is read-only → no complex state management needed
- Trade-off: no reactive UI; page refreshes are required

### Why no Twitter or LinkedIn?
- **Twitter/X**: Strict auth requirements, aggressive bot detection, DCMA/ToS legal risk, CycleTLS complexity on macOS
- **LinkedIn**: Extremely aggressive scraping blocks, account at risk, no meaningful public data endpoint
- This is a deliberate product decision, not a technical limitation

### Why no API keys for Reddit?
- Reddit's public JSON API (`/search.json`, `/r/sub/new.json`) is accessible with a browser User-Agent
- Avoids OAuth app registration, rate limit quotas, and credential management complexity
- Trade-off: lower rate limits (25 req/min vs. 60 for OAuth apps)

---

## 6. Data Quality Strategy

The system uses a **three-layer funnel** to ensure only relevant, non-duplicate data enters the database:

```
Raw API Results
      │
      ▼
┌─────────────────────┐
│  Layer 1: ID Dedup  │  Set<string> of seen `external_ids`
│  + Content Hash     │  Prevents duplicates across phases/API calls
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Layer 2: Brand     │  Strict anchor | Balanced keyword | Subreddit allowlist
│  Filter             │  Removes false positives (noise, unrelated content)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Layer 3: DB UNIQUE │  `UNIQUE(platform_id, external_id)` — final DB-level guard
│  constraint         │  `INSERT OR IGNORE` pattern
└─────────────────────┘
           │
           ▼
     Sentiment tagging → Store in SQLite
```

---

## 7. Scraper Safety Features

| Feature | Implementation |
|---|---|
| **Time-boxing** | Each scraper run has a max wall-clock time (10 min full, 5 min incremental) |
| **Buffer flushing** | Every 25 items flushed to DB → no data loss on crash |
| **Graceful degradation** | If a phase fails, scraper continues to next phase |
| **Retry with backoff** | `withRetry(fn, {maxRetries: 3, baseDelay: 1000, maxDelay: 30000})` |
| **Jitter** | Random 500–1500ms delay per request |
| **User-Agent rotation** | 5 real browser UA strings rotated per request |
| **Proxy support** | HTTPS + SOCKS5 proxies configurable in `.env` |
| **Cookie session** | Playwright saves/restores cookies between runs |

---

## 8. Interview Talking Points

### On architecture choices:
> "I chose a monolithic, single-process architecture intentionally for this MVP. It eliminates network hops between services, simplifies deployment to just `npm start`, and is appropriate for expected data volumes. If this were to scale, I'd extract the scraper into a separate worker process communicating via a message queue."

### On the scraping strategy:
> "The Reddit scraper runs five distinct phases to maximize coverage — from the public JSON API to browser-based visual verification. The key insight is using a cursor-based incremental system: once we've done a full historical scrape, subsequent runs only look at fresh data, completing in 5 minutes instead of 10."

### On anti-bot measures:
> "Bot detection works by correlating signals — perfect request timing, missing browser APIs, known automation flags. I address this by randomizing everything: viewport, user agent, hardware specs, request timing (jitter), and patching every `navigator.*` property that headless browsers expose."

### On data quality:
> "The biggest challenge with short or ambiguous brand keywords is noise — your keyword may appear in completely unrelated contexts. I built a multi-layer brand filter with configurable exclusion regex patterns that eliminate noise, combined with a balanced mode that requires the keyword to co-occur with app context words like 'download', 'android', or 'review'. This keeps the dataset clean without having to manually review every false positive."

### On the token bucket rate limiter:
> "Token bucket is the right algorithm here because it allows short bursts (filling queued requests quickly) while maintaining a long-term average. Exponential backoff on 429 responses is standard practice — double the wait on each failure, slowly recover on success."

### On SQLite with WAL:
> "SQLite in WAL mode allows concurrent reads from multiple connections while a writer is active, which is exactly my access pattern: the Express server is constantly reading while the scheduler periodically writes. WAL also improves write performance by making writes sequential to the log file."

---

### On the data quality strategy:
> "The three-layer funnel is the heart of what keeps the database clean. In-memory ID deduplication catches duplicates across API phases in a single run, the brand filter removes keyword noise, and the DB `UNIQUE` constraint is the last safety net. Each layer handles a different failure mode."

### On the new workflow features:
> "The response inbox, competitor comparison, and weekly digest were designed to address the gap between data collection and business action. Raw data in a table is not useful to a brand manager — they need a queue of items to respond to, a benchmark to compare against, and a summary they can share with their VP without exporting to Excel."

---

## 9. Potential Improvements

| Area | Improvement |
|---|---|
| **Scalability** | Replace SQLite with PostgreSQL + TimescaleDB; move scraper to a separate worker process with BullMQ |
| **Real-time UI** | Add WebSocket to push new mentions live without a page refresh |
| **LLM Sentiment** | Replace AFINN lexicon with an LLM-backed classifier for sarcasm detection and aspect-based analysis |
| **Auto-Reply Drafts** | Use LLM to generate context-aware reply suggestions in the Response Inbox |
| **Containerization** | Docker Compose with Chromium in a headless container for reproducible deployment |
| **More platforms** | YouTube comments, Google News, Trustpilot, G2, App Store search suggestions |
| **Dashboard Auth** | Basic/OAuth auth on the dashboard to protect sensitive brand data |
| **Email Digest** | Schedule the weekly digest to be emailed automatically via SendGrid or Resend |
