# Phase 3 — AI-Powered Sentiment Analysis

> **Status:** Implementation guide — ready to activate once an OpenAI / Anthropic / Ollama key is available.

The platform currently uses **AFINN lexicon + social-slang extensions** for fast, zero-cost sentiment scoring (`src/pipeline/sentiment.ts`).  Phase 3 replaces (or augments) this with a large-language-model call so you get:

| Capability | AFINN (current) | LLM (Phase 3) |
|---|---|---|
| Speed | ~0 ms | 200–800 ms per batch |
| Cost | Free | API credits or self-hosted |
| Nuance | Word-level | Full context |
| Output | score + label | score + label + **reason** + **topics** |
| Multi-lingual | English only | Model-dependent |

---

## 1. Architecture

```
mentions (raw text)
       │
       ▼
[Batch Collector]   ← collects N=20 unseen mentions
       │
       ▼
[AI Sentiment Service]
   ├── POST https://api.openai.com/v1/chat/completions
   │        (or Anthropic / Ollama)
   └── returns JSON array: [{ id, score, label, reason, topics }]
       │
       ▼
[DB Update]   ← writes ai_sentiment_score / ai_sentiment_label / ai_topics
```

The AI service runs as a **background job** (not on the hot request path) so it never slows down the dashboard.

---

## 2. Database changes

Add two nullable columns to the `mentions` table:

```sql
-- migration: V2__ai_sentiment.sql
ALTER TABLE mentions ADD COLUMN ai_sentiment_score REAL;
ALTER TABLE mentions ADD COLUMN ai_sentiment_label TEXT;
ALTER TABLE mentions ADD COLUMN ai_topics TEXT;  -- JSON array stored as TEXT
```

---

## 3. Environment variables

```dotenv
# Choose ONE provider
AI_PROVIDER=openai          # openai | anthropic | ollama
OPENAI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini        # cheapest model; fine for sentiment
AI_BATCH_SIZE=20            # mentions per LLM call (keep below 30 to stay in context)

# For Anthropic
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-haiku-20240307

# For Ollama (self-hosted, free)
OLLAMA_BASE_URL=http://localhost:11434
AI_MODEL=llama3
```

---

## 4. Implementation (`src/pipeline/aiSentiment.ts`)

```typescript
import { config } from '../config.js';
import { logger } from '../core/logger.js';
import { db } from '../db/schema.js';
import { getCircuitBreaker } from '../core/circuitBreaker.js';

const SYSTEM_PROMPT = `You are a brand-monitoring sentiment classifier.
For each mention, respond with ONLY a JSON array where every element has:
  id        – the mention id you received
  score     – float from -1.0 (very negative) to 1.0 (very positive)
  label     – "positive" | "neutral" | "negative"
  reason    – one sentence explaining the score
  topics    – string array of up to 3 product/service themes mentioned

Respond with raw JSON only — no markdown, no explanation outside the array.`;

interface AiResult {
  id: number;
  score: number;
  label: 'positive' | 'neutral' | 'negative';
  reason: string;
  topics: string[];
}

async function callOpenAi(mentions: { id: number; text: string }[]): Promise<AiResult[]> {
  const breaker = getCircuitBreaker('openai', { failureThreshold: 3, timeout: 120_000 });
  return breaker.execute(async () => {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL ?? 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(mentions) },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const data = await res.json() as any;
    return JSON.parse(data.choices[0].message.content) as AiResult[];
  });
}

/** Enrich up to `batchSize` un-scored mentions with AI sentiment. */
export async function runAiSentimentBatch(batchSize = 20): Promise<number> {
  const rows = db.prepare(`
    SELECT id, content FROM mentions
    WHERE ai_sentiment_label IS NULL AND content IS NOT NULL
    LIMIT ?
  `).all(batchSize) as { id: number; content: string }[];

  if (rows.length === 0) return 0;

  const input = rows.map(r => ({ id: r.id, text: r.content.slice(0, 500) }));

  let results: AiResult[];
  try {
    results = await callOpenAi(input);
  } catch (err) {
    logger.error('AI sentiment batch failed', { err });
    return 0;
  }

  const update = db.prepare(`
    UPDATE mentions
    SET ai_sentiment_score = ?,
        ai_sentiment_label = ?,
        ai_topics          = ?
    WHERE id = ?
  `);

  const persist = db.transaction((rows: AiResult[]) => {
    for (const r of rows) {
      update.run(r.score, r.label, JSON.stringify(r.topics), r.id);
    }
  });
  persist(results);

  logger.info(`AI sentiment: enriched ${results.length} mentions`);
  return results.length;
}
```

---

## 5. Schedule the batch job

In `src/scheduler/jobs.ts`, add:

```typescript
import { runAiSentimentBatch } from '../pipeline/aiSentiment.js';

// Runs every 30 minutes — processes only un-scored rows
{
  name: 'AI Sentiment Enrichment',
  cron: '*/30 * * * *',
  runner: async () => { await runAiSentimentBatch(20); },
  enabled: !!process.env.OPENAI_API_KEY || !!process.env.ANTHROPIC_API_KEY,
},
```

---

## 6. Dashboard integration

Once `ai_sentiment_label` is populated, the `/api/trends` and `/api/brand/score` queries can be updated to prefer `ai_sentiment_label` over `sentiment_label`:

```sql
-- prefer AI label when available
COALESCE(ai_sentiment_label, sentiment_label) AS effective_label
```

This gives a graceful fallback: AFINN scores remain valid for old data while AI enrichment catches up incrementally.

---

## 7. Cost estimate

| Volume | Model | Cost/month |
|---|---|---|
| 10 000 mentions | gpt-4o-mini | ~$0.30 |
| 50 000 mentions | gpt-4o-mini | ~$1.50 |
| Any volume | Ollama (local) | $0 |

For self-hosted / zero-cost: set `AI_PROVIDER=ollama` and run `ollama pull llama3`.

---

## 8. Persona / audience segment analysis (Phase 3b)

The `GET /api/audience/segments` endpoint already segments your audience by engagement tier, platform, and time-of-day using existing DB data.  In Phase 3b you can extend this with an LLM call that reads the top 50 mentions and returns:

```json
{
  "personas": [
    { "label": "Power User", "pct": 12, "traits": ["posts frequently", "technical", "early adopter"] },
    { "label": "Casual Reviewer", "pct": 55, "traits": ["one-time poster", "product-focused"] },
    { "label": "Critic", "pct": 8, "traits": ["negative tone", "compares to competitors"] }
  ]
}
```

This extends the rule-based segmentation in `getAudienceSegments()` with natural-language persona labels.
