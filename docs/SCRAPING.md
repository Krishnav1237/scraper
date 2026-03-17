# Scraping Intelligence & Strategy

> **Scope:** Data ingestion, anti-detection, rate limiting, and cursor logic
> **Audience:** Engineers and contributors

---

## 1. Overview

The ingestion engine goes far beyond simple page fetches. It combines **stateful incremental scraping**, **adversarial avoidance**, and a **multi-phase search strategy** to ensure reliable, long-term data quality across Reddit and both mobile app stores.

---

## 2. Reddit — Multi-Phase Strategy

Reddit scraping runs in five sequential phases. Each phase targets a different slice of content, maximising coverage while distributing request load.

| Phase | Method | What it captures |
|-------|---------|-----------------|
| **0** | Subreddit listings (`/r/<sub>`) | All posts and comments in brand-owned or monitored subreddits |
| **1** | `search.json` (keyword × sort × time) | Exhaustive keyword search across all of Reddit |
| **2** | Per-subreddit restricted search | Targeted searches in relevant subreddits |
| **3** | Comment-specific search (`type=comment`) | Brand mentions buried inside comment threads |
| **4** | Pushshift / PullPush archive API | Historical data (skipped on incremental runs) |
| **5** | Playwright browser verification | Visual DOM extraction as a final cross-check |

### Incremental vs. Full Mode

The scraper checks `scrape_cursors`. If a cursor exists, phases 0–3 run with narrow time filters (`day` / `week`), completing in ~5 minutes instead of ~10. A full run is only triggered when no cursor exists (first run) or when explicitly forced.

### Search Term Expansion

`SEARCH_TERMS` values are automatically combined with common suffixes and platform qualifiers (`app`, `io`, `android`, `ios`, `review`, etc.) to produce multiple query variants. This maximises recall without requiring manual curation of every variant.

---

## 3. Anti-Detection

### Mode A — JSON API (Speed)

Appends `.json` to Reddit search URLs (e.g. `reddit.com/search.json?q=yourbrand`).

- **Pros:** 100× faster; minimal CPU.
- **Cons:** Aggressive rate limiting (HTTP 429).
- **Mitigation:** Token-bucket limiter at 25 req/min; exponential backoff on 429 (2s → 4s → 8s → 16s).

### Mode B — Playwright Browser (Reliability)

Used when the JSON API is blocked or for App Store scraping.

- **Stealth patches:** `puppeteer-extra-plugin-stealth` removes `navigator.webdriver` and other bot signals.
- **Human behaviour simulation:** Random delays between actions (via `humanize.ts`), smooth scrolling, realistic viewport sizes.
- **Cookie persistence:** Session cookies are stored and reused across runs to maintain a consistent browser profile.
- **Fingerprint consistency:** Fixed UA string, screen resolution, and timezone.

---

## 4. Brand Filtering

Raw keyword searches produce noise. The brand filter applies one of two modes:

**Strict Mode (`FILTER_STRICT=true`)**
Only retains content containing at least one configured anchor term (e.g. `yourbrand.com`, `yourbrand.io`). Highest precision, lowest recall.

**Balanced Mode (`FILTER_BALANCED=true`, default)**
Retains content with your keyword if it also contains product-context words (`app`, `game`, `android`, `ios`, `download`, `review`, `update`, etc.). Eliminates false positives without sacrificing recall.

Both modes can be supplemented with custom exclusion regex patterns in `brandFilter.ts` to handle brand-specific noise.

---

## 5. Rate Limiting

The rate limiter (`src/core/rateLimit.ts`) implements a **token-bucket algorithm**:

```
Bucket capacity: 25 tokens
Refill rate:     25 tokens / 60 seconds
Cost per request: 1 token
```

- Requests block until a token is available.
- 429 responses trigger exponential backoff: each failure doubles the wait, each success halves it.
- Separate buckets per platform prevent one platform's limits from affecting others.

---

## 6. Cursor-Based Incremental Scraping

Every scrape job records a cursor in `scrape_cursors`:

```
platform  | search_term    | last_id         | last_fetched_at
----------|----------------|-----------------|--------------------
reddit    | yourbrand      | t3_xyz123       | 2025-03-10 04:00:00
playstore | com.example    | (epoch ms)      | 2025-03-10 03:00:00
```

On the next run the scraper starts from the cursor position, skipping everything already seen. An in-memory `Set<string>` of external IDs provides a secondary dedup guard within a single run (catching duplicates across phases before they hit the database).

The database provides a final safety net: `UNIQUE(platform, external_id)` with `INSERT OR IGNORE`.

---

## 7. App Store Scrapers

### Google Play
Uses the `google-play-scraper` npm package for structured review data. Falls back to Playwright if the package returns no results.

### Apple App Store
Fetches the RSS review feed first (fast, no browser required). Playwright is used for pagination beyond what the RSS feed covers.

---

## 8. Configuration Reference

```ini
# How often to scrape (Cron syntax)
REDDIT_CRON="0 */4 * * *"       # Every 4 hours
PLAYSTORE_CRON="0 */3 * * *"    # Every 3 hours
APPSTORE_CRON="0 */3 * * *"     # Every 3 hours

# Browser controls
HEADLESS=true     # false to watch the browser during debugging
SLOWMO=0          # ms between Playwright actions

# Filtering
FILTER_STRICT=false
FILTER_BALANCED=true
```

**Recommendation:** Do not scrape more frequently than hourly. Brand conversations move slowly and higher frequency increases the risk of IP bans without meaningful data gain.
