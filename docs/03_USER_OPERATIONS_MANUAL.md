# Social Media Brand Monitor: User Operations Manual & API Reference
> **Document ID:** USER-OPS-V2
> **Audience:** Analysts, Product Managers, Developers
> **Scope:** Dashboard Usage, Data Export, API Specs, Outreach, Inbox, Competitor Intel, Weekly Digest
> **Status:** Active

---

# 1. Getting Started

The Social Media Brand Monitor is your autonomous listening post and community outreach hub. This manual guides you through operating the dashboard, interpreting the data, publishing community content, and integrating the system with other tools.

## 1.1 Accessing the Interface
- **Local:** `http://localhost:3000`
- **Server:** `http://<your-server-ip>:3000`
- **Mobile/Tablet:** The dashboard is fully responsive. Access it from your phone's browser while on the corporate VPN/Wi-Fi to check stats on the go.

---

# 2. The Command Dashboard

## 2.1 The "Overview" (Mission Control)
The home page provides an at-a-glance health check of your brand.

### Global Search
The search box in the header bar searches across **both** mentions and reviews simultaneously. Results are shown on the Mentions page; for a raw JSON response use `GET /api/search?q=<term>`.

### Intelligence Cards
- **Total Mentions:** The lifetime count of every brand discussion on Reddit.
- **Total Reviews:** Cumulative feedback from Google Play and App Store.
- **Last 24h Pulse:** The most critical metric. A sudden spike here usually indicates an incident (e.g., app crash) or a viral moment.

### Sentiment Health Bar
A real-time colour bar beneath the metrics row shows the overall positive/negative/neutral split across all scraped mentions. Green = positive, grey = neutral, red = negative.

### Outreach Quick-Stats
Next to the sentiment bar you'll see how many Reddit posts are live and how many drafts are pending — with a one-click link to the Outreach module.

### Visual Analytics
- **Sentiment Distribution Table:** Breaks down mentions by `Positive`, `Neutral`, `Negative` per platform.
- **Star Rating Table:** Compare Google Play vs App Store performance side-by-side.

### System Health
- **Recent Scrape Logs:** Shows the last 15 automated jobs.
    - 🟢 **Success:** New data found (or verified no new data).
    - 🟡 **Running:** Job is currently active.
    - 🔴 **Failed:** Job encountered a critical error.

## 2.2 The "Mentions" Console (`/mentions`)
This is your search engine for social content.

### Advanced Filtering
- **Search Dynamics (Auto-Search):** Just start typing. The system waits for you to pause (600ms) before automatically refreshing the results.
- **Sentiment Filter:** Isolate "Negative" posts to find frustrated users. Isolate "Positive" posts for marketing testimonials.
- **Date Range:** Drill down into specific marketing campaign windows.
- **Deep Linking:** Every filter updates the URL — copy it to share a specific view with your team.

### Inline Triage Actions
Each mention row has two icon buttons:
- **⭐ Bookmark** — marks the mention for later reference.
- **🔔 Flag for Action** — routes the mention into the Response Inbox for team follow-up.

## 2.3 The "Reviews" Console (`/reviews`)
Aggregates feedback from both mobile stores into a single stream.

### Power User Workflows
- **Find Bugs:** Filter for `Rating < 3` AND Search for "bug".
- **Version Check:** Filter by app version to see if a hotfix solved complaints.

## 2.4 The "Response Inbox" (`/inbox`)
A dedicated triage queue for your brand response team.

### What appears in the Inbox?
Any mention that has been **bookmarked** (⭐) or **flagged for action** (🔔) from the Mentions page.

### Triage Workflow
Each inbox item has a three-stage status:
| Status | Meaning |
|--------|---------|
| `Open` | Newly flagged, not yet reviewed |
| `In Progress` | A team member is actively working on a response |
| `Resolved` | Response sent or issue closed |

Use the status dropdown on each item to advance it through the pipeline.

### Internal Notes
Add private notes to any inbox item (e.g. "Escalated to customer success", "Already replied via email"). Notes are not visible to the original poster — they are for internal team coordination only.

## 2.5 The "Competitor Comparison" (`/compare`)
See how your brand stacks up against competitors tracked in your projects.

### Filters
- **Project** — select the project whose tracked entities you want to compare.
- **Time Window** — choose 7, 14, 30, or 90 days.

### What the page shows
| Metric | Description |
|--------|-------------|
| Mention Volume | Total mentions in the selected window |
| 7d / 30d Change | Absolute delta vs the previous equivalent period |
| Positive % | Percentage of mentions with positive sentiment |
| Negative % | Percentage of mentions with negative sentiment |
| Sentiment Bar | Visual colour bar showing the positive/neutral/negative split |

### API access
```
GET /api/compare?projectId=<id>&days=30
```

## 2.6 The "Weekly Digest Report" (`/report`)
A stakeholder-ready summary of the past week's brand performance.

### KPI Cards
| Card | Description |
|------|-------------|
| Mentions | Total mentions this week vs last week (with % change) |
| Reviews | Total reviews this week with average star rating |
| Positive Sentiment | Percentage of positive mentions this week |
| Negative Sentiment | Percentage of negative mentions this week |
| Alerts Fired | Number of alert rules triggered this week |

### Charts & Tables
- **Daily Mentions Bar Chart** — a simple CSS bar chart showing mention volume per day of the week.
- **Platform Breakdown** — mention count per platform.
- **Top Engaged Mentions** — the mentions with the most likes + comments.
- **Low-Rated Reviews** — reviews rated 1 or 2 stars (needs attention).

### Navigation
Use the **← Previous Week** and **Next Week →** links at the top to navigate back in time. You can also append `?weeksAgo=N` to the URL to jump directly (e.g. `?weeksAgo=4` = 4 weeks ago).

### Export
```
GET /api/report/weekly?weeksAgo=0
```
Returns the full digest as JSON — useful for feeding into Slack bots, email reports, or BI tools.

## 2.7 The "Outreach" Module (`/outreach`)

### Setup
1. Navigate to **Outreach** in the sidebar.
2. Click **Connect Reddit** — you'll be redirected to Reddit's OAuth page.
3. Approve the requested scopes (`submit identity`).
4. You'll be redirected back with your Reddit username shown.

### Target Subreddits
Add subreddits where you want to post. Each has:
- **Name** — without `r/` prefix
- **Cooldown hours** — minimum time between posts to that subreddit (default: 168h = 1 week)
- **Notes** — internal context
- **Enable/Disable toggle**

### Draft Posts
Create text (`self`) or link posts:
- **Title** (required, up to 300 characters)
- **Body** — Markdown supported for text posts
- **URL** — required for link posts
- **Disclosure** — optional note shown alongside the post for transparency

### Submitting
Click **Post** on a draft. The system:
1. Validates your Reddit token (refreshes if expired)
2. Calls `https://oauth.reddit.com/api/submit`
3. Records the result in the audit log (success or failure with Reddit's error message)
4. Updates draft status to `posted` or `failed`

You can retry `failed` drafts after fixing the issue.

---

# 3. Data Liberation (Exports)

## 3.1 Context-Aware CSV Export
The "Export CSV" buttons respect your current filters — e.g. exporting only 1-star reviews from the last 30 days.

## 3.2 Combined Export (New in v2)
Download a single CSV with all mentions **and** all reviews in one file:
```
GET /api/export/all
GET /api/export/all?startDate=2025-01-01&endDate=2025-12-31
```
Columns: `Date, Type, Platform, Author, Content, URL, Likes, Comments, Rating, Title, Sentiment`

## 3.3 Google Sheets Sync (API)
Re-uploads the full dataset to a configured Google Sheet (overwrite, not append).

**Sync Mentions:**
```bash
curl "http://localhost:3000/api/export/sheets?type=mentions"
```

**Sync Reviews:**
```bash
curl "http://localhost:3000/api/export/sheets?type=reviews"
```

---

# 4. Developer API Reference

**Base URL:** `http://localhost:3000/api/`

## 4.1 Stats & Metrics

### `GET /api/stats`
Returns the raw numbers behind the Overview page.
```json
{
  "mentions": [{ "platform": "reddit", "total": 1240, "positive": 410, "negative": 180 }],
  "reviews": [{ "platform": "playstore", "total": 530, "avg_rating": 4.2 }],
  "last24h": { "mentions": 12, "reviews": 3 }
}
```

### `GET /api/health`
Liveness probe — suitable for Pingdom, UptimeRobot, or CI pipelines.
```json
{
  "status": "ok",
  "timestamp": "2025-06-01T12:00:00.000Z",
  "uptimeSeconds": 84020,
  "data": { "totalMentions": 1240, "totalReviews": 530, "last24hMentions": 12, "last24hReviews": 3 }
}
```

### `GET /api/status`
Returns scheduler info, rate-limit state per platform, and the last 5 log entries.

---

## 4.2 Data Query Endpoints

### `GET /api/mentions`
**Query Params:** `platform`, `sentiment` (`positive`|`negative`|`neutral`), `search`, `startDate`, `endDate`, `limit` (default 50), `offset`

### `GET /api/reviews`
**Query Params:** `platform` (`playstore`|`appstore`), `rating` (1-5), `sentiment`, `search`, `startDate`, `endDate`, `limit`, `offset`

### `GET /api/trends?days=30`
Day-by-day mention count + sentiment breakdown for the last N days (max 365).

### `GET /api/search?q=<term>&limit=20`
Cross-table search — returns matching mentions and reviews simultaneously.
```json
{
  "query": "crash",
  "mentions": { "count": 8, "items": ["..."] },
  "reviews": { "count": 14, "items": ["..."] },
  "total": 22
}
```

### `GET /api/sentiment/summary?days=30`
Sentiment percentages over a rolling window + daily trend data.
```json
{
  "windowDays": 30,
  "totals": { "mentions": 400, "positive": 180, "negative": 80, "neutral": 140 },
  "percentages": { "positive": 45.0, "negative": 20.0, "neutral": 35.0 },
  "trend": [{ "date": "2025-05-01", "mentions": 14, "positive": 6, "negative": 2, "neutral": 6 }]
}
```

---

## 4.3 Response Inbox Endpoints

### `GET /api/inbox`
Returns all mentions that have `bookmarked = 1` or `action_required = 1`, ordered by most recently updated.

### `POST /mentions/:id/bookmark`
Toggles the bookmark flag on a mention. Returns `{ bookmarked: true|false }`.

### `POST /mentions/:id/action`
Toggles the action-required flag. Returns `{ action_required: true|false }`.

### `POST /mentions/:id/status`
Updates the triage status. Body: `{ status: "open" | "in_progress" | "resolved" }`.

### `POST /mentions/:id/notes`
Saves internal notes. Body: `{ notes: "your text here" }`.

---

## 4.4 Analytics Endpoints

### `GET /api/compare?projectId=<id>&days=30`
Returns a side-by-side comparison of all entities tracked in the project.
```json
[
  {
    "name": "Your Brand",
    "type": "brand",
    "mentions": 120,
    "delta_7d": 14,
    "delta_30d": -5,
    "positive_pct": 68,
    "negative_pct": 12
  },
  {
    "name": "Competitor A",
    "type": "competitor",
    "mentions": 87,
    "delta_7d": -3,
    "delta_30d": 10,
    "positive_pct": 55,
    "negative_pct": 20
  }
]
```

**Query Params:**
- `projectId` — filter to a specific project's entities (optional; returns all entities if omitted)
- `days` — comparison window in days (default: `30`)

### `GET /api/report/weekly?weeksAgo=0`
Returns the full weekly digest as JSON. `weeksAgo=0` = current week, `weeksAgo=1` = last week, etc.
```json
{
  "weekLabel": "Mar 10 – Mar 16, 2025",
  "kpis": {
    "mentions": 84, "mentions_prev": 71, "mentions_change_pct": 18,
    "reviews": 12, "avg_rating": 3.9,
    "positive_pct": 62, "negative_pct": 18,
    "alerts_fired": 2
  },
  "dailyChart": [{ "day": "Mon", "count": 14 }, "..."],
  "platformBreakdown": [{ "platform": "reddit", "count": 70 }, "..."],
  "topMentions": ["..."],
  "lowRatedReviews": ["..."]
}
```

---

## 4.5 System Status
### `GET /api/status`
Returns scheduler info, rate-limit state per platform, and the last 5 log entries.

---

# 5. Configuration & Tuning

## 5.1 Environment Variables
Located in `.env`. Key settings:
- `SEARCH_TERMS` — comma-separated keywords to search on Reddit
- `REQUIRED_TERMS` — at least one must appear to store a mention (also accepted as `BRAND_REQUIRED_TERMS`)
- `FILTER_STRICT=true` — only keep exact anchor matches (no contextual matching)
- `FILTER_BALANCED=true` — keep mentions only when near app/game/product context words

## 5.2 Scrape Frequency
Controlled by standard Cron syntax in `.env`.
- **Default:** `0 */4 * * *` (every 4 hours)
- **Recommendation:** Do not go below hourly. Conversations move slowly and higher frequency increases ban risk.

## 5.3 Webhook Alerts
When creating or editing an alert rule on the Projects page, enter a **Webhook URL**. When the alert fires the system sends an HTTP POST with this payload:

**Slack / Discord format (auto-detected from URL):**
- Slack: `{ "text": "🚨 Alert: <rule name> ...", "attachments": [...] }`
- Discord: `{ "content": "🚨 Alert: <rule name> ..." }`
- Generic HTTP: `{ "event": "alert_fired", "rule": {...}, "timestamp": "..." }`

Leave the URL blank to disable webhook delivery for a rule.

---

# 6. Troubleshooting Guide

| Problem | Solution |
|---------|----------|
| **"Google Sheets Export Failed"** | Check `GOOGLE_SERVICE_ACCOUNT_JSON` path and confirm the service account's `client_email` is an **Editor** on the Sheet |
| **"No Data Found"** | Check the Logs page for red "Failed" entries. Verify `FILTER_STRICT` is not too aggressive for your keywords |
| **"Scraper Failed (503 / 429)"** | Normal — the retry engine recovers automatically next cycle. If it persists beyond 24h, try a different IP or add a proxy |
| **"Reddit Outreach — Invalid OAuth state"** | OAuth states expire after 10 minutes. Start the flow again from `/outreach` |
| **"Reddit Outreach — Post rejected"** | Reddit's error appears on the draft. Common causes: spam filters, cooldown violations, low account karma, subreddit rules |
| **Webhook not firing** | Ensure a webhook URL is saved on the alert rule and the endpoint is publicly reachable |
| **Inbox empty** | No mentions have been bookmarked (⭐) or flagged for action (🔔) yet — use the inline buttons on the Mentions page |

