# User Operations Manual

> **Scope:** Dashboard usage, API reference, configuration, and troubleshooting
> **Audience:** Analysts, product managers, and developers

---

## 1. Getting Started

After completing the [Quick Start](../README.md#-quick-start) and opening `http://localhost:3000`, the system is ready to use. All scrapers run on their configured schedules automatically. You can also trigger them manually at any time:

```bash
npm run scrape:reddit
npm run scrape:playstore
npm run scrape:appstore
npm run scrape:all
```

---

## 2. Dashboard Pages

### 2.1 Overview (`/`)

The home page provides a real-time snapshot of your brand's health:

- **Sentiment health bar** — a colour-coded strip showing the positive/neutral/negative breakdown at a glance.
- **Metrics cards** — total mentions, total reviews, last-24h activity, and alert count.
- **Activity feed** — the most recent mentions and reviews.

### 2.2 Mentions (`/mentions`)

Your search engine for Reddit content.

**Filters available:**
- **Keyword search** — auto-searches 600ms after you stop typing (no need to press Enter).
- **Sentiment** — isolate Positive, Neutral, or Negative mentions.
- **Platform** — filter by Reddit, Play Store, or App Store.
- **Date range** — drill into a specific campaign window.

**Inline triage actions** (per row):
- ⭐ **Bookmark** — saves the mention for later reference.
- 🔔 **Flag for action** — routes the mention into the Response Inbox.

**Exports:** CSV and JSON download buttons appear above the table.

**Deep linking:** Every filter combination updates the page URL. Copy and share the URL to give a team member an exact filtered view.

### 2.3 Reviews (`/reviews`)

Aggregates feedback from Google Play and the Apple App Store in one stream.

**Useful workflows:**
- Filter by `Rating < 3` and search for "crash" to find bug reports.
- Filter by app version to verify whether a hotfix resolved complaints.

### 2.4 Response Inbox (`/inbox`)

A triage queue for your brand response team. All mentions that have been bookmarked (⭐) or flagged for action (🔔) appear here.

**Triage workflow:**

| Status | Meaning |
|--------|---------|
| `Open` | Newly flagged, awaiting review |
| `In Progress` | A team member is actively working on a response |
| `Resolved` | Response sent or issue closed |

Use the status dropdown on each item to advance it through the pipeline. Internal notes can be added to any item for team coordination — they are never visible to the original poster.

### 2.5 Competitor Comparison (`/compare`)

Side-by-side view of all entities tracked in your projects.

**Filters:** Project and time window (7, 14, 30, or 90 days).

| Metric | Description |
|--------|-------------|
| Mention volume | Total mentions in the selected window |
| 7d / 30d change | Absolute delta vs. the previous equivalent period |
| Positive % | Percentage of mentions with positive sentiment |
| Negative % | Percentage of mentions with negative sentiment |
| Sentiment bar | Visual colour bar showing the positive/neutral/negative split |

### 2.6 Weekly Digest (`/report`)

A stakeholder-ready summary of the past week.

**KPI cards:** Mentions (with week-over-week % change), reviews (with average rating), positive %, negative %, and alerts fired.

**Charts and tables:**
- Daily mentions bar chart
- Platform breakdown table
- Top engaged mentions (sorted by likes + comments)
- Low-rated reviews (1–2 stars)

Use **← Previous Week** / **Next Week →** to navigate, or append `?weeksAgo=N` to the URL (e.g. `?weeksAgo=4` = four weeks ago).

### 2.7 Projects (`/projects`)

Create projects to scope monitoring. Each project can have:
- **Keyword groups** — sets of search terms
- **Monitored entities** — your brand and competitor handles
- **Alert rules** — spike thresholds with optional webhook URLs

### 2.8 Outreach (`/outreach`)

Publish community posts to Reddit directly from the dashboard.

**Setup:**
1. Click **Connect Reddit** and approve the requested OAuth scopes.
2. Add target subreddits and configure posting cooldowns.
3. Create a draft post. Once reviewed, click **Submit** to publish. Every submission is logged in the audit trail.

### 2.9 Logs (`/logs`)

A history of the last 100 scraper runs with status (success / failed), duration, and item counts.

---

## 3. API Reference

**Base URL:** `http://localhost:3000`

### 3.1 Stats & Health

#### `GET /api/stats`
Aggregate counts behind the Overview page.
```json
{
  "mentions": [{ "platform": "reddit", "total": 1240, "positive": 410, "negative": 180 }],
  "reviews": [{ "platform": "playstore", "total": 530, "avg_rating": 4.2 }],
  "last24h": { "mentions": 12, "reviews": 3 }
}
```

#### `GET /api/health`
Liveness probe — useful for uptime monitors and CI pipelines.
```json
{
  "status": "ok",
  "timestamp": "2025-06-01T12:00:00.000Z",
  "uptimeSeconds": 84020,
  "data": { "totalMentions": 1240, "totalReviews": 530, "last24hMentions": 12, "last24hReviews": 3 }
}
```

#### `GET /api/status`
Scheduler info, rate-limit state per platform, and last 5 log entries.

---

### 3.2 Data Queries

#### `GET /api/mentions`
**Query params:** `platform`, `sentiment` (`positive`|`negative`|`neutral`), `search`, `startDate`, `endDate`, `limit` (default 50), `offset`

#### `GET /api/reviews`
**Query params:** `platform` (`playstore`|`appstore`), `rating` (1–5), `sentiment`, `search`, `startDate`, `endDate`, `limit`, `offset`

#### `GET /api/trends?days=30`
Day-by-day mention count and sentiment breakdown. Max 365 days.

#### `GET /api/search?q=<term>&limit=20`
Cross-table search across mentions and reviews simultaneously.
```json
{
  "query": "crash",
  "mentions": { "count": 8, "items": ["..."] },
  "reviews": { "count": 14, "items": ["..."] },
  "total": 22
}
```

#### `GET /api/sentiment/summary?days=30`
Rolling-window sentiment percentages and daily trend.
```json
{
  "windowDays": 30,
  "totals": { "mentions": 400, "positive": 180, "negative": 80, "neutral": 140 },
  "percentages": { "positive": 45.0, "negative": 20.0, "neutral": 35.0 },
  "trend": [{ "date": "2025-05-01", "mentions": 14, "positive": 6, "negative": 2, "neutral": 6 }]
}
```

---

### 3.3 Response Inbox

#### `GET /api/inbox`
Returns all mentions with `bookmarked = 1` or `action_required = 1`, ordered by most recently updated.

#### `POST /mentions/:id/bookmark`
Toggles the bookmark flag. Returns `{ "bookmarked": true }`.

#### `POST /mentions/:id/action`
Toggles the action-required flag. Returns `{ "action_required": true }`.

#### `POST /mentions/:id/status`
Body: `{ "status": "open" | "in_progress" | "resolved" }`

#### `POST /mentions/:id/notes`
Body: `{ "notes": "your note here" }`

---

### 3.4 Analytics

#### `GET /api/compare?projectId=<id>&days=30`
Side-by-side entity stats.
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
  }
]
```

**Query params:** `projectId` (optional — omit to return all entities), `days` (default: 30)

#### `GET /api/report/weekly?weeksAgo=0`
Full weekly digest. `weeksAgo=0` = current week, `weeksAgo=1` = last week.
```json
{
  "weekLabel": "Mar 10 – Mar 16, 2025",
  "kpis": {
    "mentions": 84, "mentions_prev": 71, "mentions_change_pct": 18,
    "reviews": 12, "avg_rating": 3.9,
    "positive_pct": 62, "negative_pct": 18,
    "alerts_fired": 2
  },
  "dailyChart": [{ "day": "Mon", "count": 14 }],
  "platformBreakdown": [{ "platform": "reddit", "count": 70 }],
  "topMentions": ["..."],
  "lowRatedReviews": ["..."]
}
```

---

### 3.5 Exports

| Endpoint | Description |
|----------|-------------|
| `GET /api/export/mentions` | Mentions as CSV |
| `GET /api/export/mentions.json` | Mentions as JSON attachment |
| `GET /api/export/reviews` | Reviews as CSV |
| `GET /api/export/reviews.json` | Reviews as JSON attachment |
| `GET /api/export/all` | Combined mentions + reviews as a single CSV |
| `GET /api/export/sheets?type=mentions\|reviews` | Push to Google Sheets |

---

## 4. Webhook Alerts

When creating or editing an alert rule on the Projects page, enter a **Webhook URL**. When the rule fires, the system sends an HTTP POST:

- **Slack URL detected** → `{ "text": "🚨 Alert: ...", "attachments": [...] }`
- **Discord URL detected** → `{ "content": "🚨 Alert: ..." }`
- **Any other URL** → `{ "event": "alert_fired", "rule": {...}, "timestamp": "..." }`

Leave the URL blank to disable webhook delivery for a rule.

---

## 5. Troubleshooting

| Problem | Solution |
|---------|----------|
| **No data showing** | Check the Logs page for failed entries. Verify `REQUIRED_TERMS` in `.env` are not too restrictive |
| **Scraper failed (503 / 429)** | Normal — the retry engine recovers automatically next cycle. If failures persist beyond 24 hours, try a different IP or add a proxy |
| **Webhook not firing** | Confirm the webhook URL is saved on the alert rule and the endpoint is publicly reachable |
| **Inbox empty** | No mentions have been bookmarked (⭐) or flagged for action (🔔) yet — use the inline buttons on the Mentions page |
| **"Google Sheets export failed"** | Verify the service account's `client_email` is added as an **Editor** on the target Sheet |
| **"Reddit Outreach — post rejected"** | The Reddit error message appears on the draft. Common causes: spam filters, posting cooldowns, low account karma, subreddit rules |
| **"Invalid OAuth state"** | OAuth states expire after 10 minutes. Restart the flow from `/outreach` |
