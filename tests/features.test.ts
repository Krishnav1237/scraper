import { describe, it, expect } from 'vitest';

// ============================================================================
// Tests for new business-feature query functions
// These use in-memory / isolated logic tests where possible.
// ============================================================================

// ── 1. Webhook payload shape helpers ────────────────────────────────────────
// We test the payload logic that _fireWebhook uses (without actually firing).

function buildWebhookPayload(
  type: 'slack' | 'discord' | 'generic',
  alertName: string,
  alertType: string,
  message: string,
  value: number | null
): object {
  if (type === 'slack') {
    return {
      text: `🚨 *Alert: ${alertName}*\n${message}`,
      attachments: [{ color: 'danger', fields: [{ title: 'Value', value: String(value ?? ''), short: true }] }],
    };
  } else if (type === 'discord') {
    return { content: `🚨 **Alert: ${alertName}**\n${message}` };
  } else {
    return { alert: alertName, type: alertType, message, value, timestamp: expect.any(String) };
  }
}

describe('Webhook payload builder', () => {
  it('builds a Slack payload correctly', () => {
    const payload = buildWebhookPayload('slack', 'Spike Alert', 'mention_spike', 'Spike detected!', 42) as any;
    expect(payload.text).toContain('Spike Alert');
    expect(payload.text).toContain('Spike detected!');
    expect(payload.attachments[0].color).toBe('danger');
    expect(payload.attachments[0].fields[0].value).toBe('42');
  });

  it('builds a Discord payload correctly', () => {
    const payload = buildWebhookPayload('discord', 'Neg Sentiment', 'negative_sentiment', 'High negative: 75%', 75) as any;
    expect(payload.content).toContain('Neg Sentiment');
    expect(payload.content).toContain('75%');
  });

  it('builds a generic HTTP payload correctly', () => {
    const payload = buildWebhookPayload('generic', 'My Rule', 'mention_spike', 'Volume high', 100) as any;
    expect(payload.alert).toBe('My Rule');
    expect(payload.type).toBe('mention_spike');
    expect(payload.value).toBe(100);
    expect(payload.message).toBe('Volume high');
  });

  it('handles null value in generic payload', () => {
    const payload = buildWebhookPayload('generic', 'R', 'negative_sentiment', 'msg', null) as any;
    expect(payload.value).toBeNull();
  });
});

// ── 2. Weekly Digest change_pct calculation ──────────────────────────────────

function calcChangePct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

describe('Weekly Digest change_pct', () => {
  it('calculates positive change correctly', () => {
    expect(calcChangePct(150, 100)).toBe(50);
  });

  it('calculates negative change correctly', () => {
    expect(calcChangePct(50, 100)).toBe(-50);
  });

  it('returns null when previous is zero', () => {
    expect(calcChangePct(10, 0)).toBeNull();
  });

  it('returns 0 when no change', () => {
    expect(calcChangePct(100, 100)).toBe(0);
  });
});

// ── 3. Entity comparison percentage calculation ──────────────────────────────

function calcEntityPcts(positive: number, negative: number, neutral: number) {
  const total = positive + negative + neutral;
  if (total === 0) return { positive_pct: 0, negative_pct: 0 };
  return {
    positive_pct: Math.round((positive / total) * 100),
    negative_pct: Math.round((negative / total) * 100),
  };
}

describe('Entity comparison percentages', () => {
  it('computes positive and negative pct correctly', () => {
    const result = calcEntityPcts(60, 20, 20);
    expect(result.positive_pct).toBe(60);
    expect(result.negative_pct).toBe(20);
  });

  it('handles all-positive case', () => {
    const result = calcEntityPcts(100, 0, 0);
    expect(result.positive_pct).toBe(100);
    expect(result.negative_pct).toBe(0);
  });

  it('returns zeroes when total is zero', () => {
    const result = calcEntityPcts(0, 0, 0);
    expect(result.positive_pct).toBe(0);
    expect(result.negative_pct).toBe(0);
  });
});

// ── 4. Inbox action status transitions ──────────────────────────────────────

type ActionStatus = 'open' | 'in_progress' | 'resolved';

function isValidActionStatus(s: string): s is ActionStatus {
  return ['open', 'in_progress', 'resolved'].includes(s);
}

describe('Inbox action status validation', () => {
  it('accepts valid statuses', () => {
    expect(isValidActionStatus('open')).toBe(true);
    expect(isValidActionStatus('in_progress')).toBe(true);
    expect(isValidActionStatus('resolved')).toBe(true);
  });

  it('rejects invalid statuses', () => {
    expect(isValidActionStatus('pending')).toBe(false);
    expect(isValidActionStatus('')).toBe(false);
    expect(isValidActionStatus('OPEN')).toBe(false);
  });
});

// ── 5. Brand Health Score logic ──────────────────────────────────────────────
// Tests for the pure computation helpers extracted from getBrandScore().

type BrandVerdict =
  | 'Excellent' | 'Strong' | 'Good' | 'Mixed'
  | 'Concerning' | 'Critical' | 'Insufficient Data';

function scoreToVerdict(score: number | null): BrandVerdict {
  if (score === null) return 'Insufficient Data';
  if (score >= 80) return 'Excellent';
  if (score >= 65) return 'Strong';
  if (score >= 50) return 'Good';
  if (score >= 35) return 'Mixed';
  if (score >= 20) return 'Concerning';
  return 'Critical';
}

function calcMentionScore(positive: number, negative: number, neutral: number): number | null {
  const total = positive + negative + neutral;
  if (total === 0) return null;
  return Math.round((positive * 100 + neutral * 50 + negative * 0) / total);
}

function calcReviewScore(avgRating: number | null, total: number): number | null {
  if (total === 0 || avgRating === null) return null;
  return Math.round(((avgRating - 1) / 4) * 100);
}

function calcOverallScore(mentionScore: number | null, reviewScore: number | null): number | null {
  if (mentionScore !== null && reviewScore !== null)
    return Math.round(0.65 * mentionScore + 0.35 * reviewScore);
  if (mentionScore !== null) return mentionScore;
  if (reviewScore !== null) return reviewScore;
  return null;
}

describe('Brand Health Score — verdict mapping', () => {
  it('maps null score to Insufficient Data', () => {
    expect(scoreToVerdict(null)).toBe('Insufficient Data');
  });

  it('maps scores to correct verdict buckets', () => {
    expect(scoreToVerdict(100)).toBe('Excellent');
    expect(scoreToVerdict(80)).toBe('Excellent');
    expect(scoreToVerdict(79)).toBe('Strong');
    expect(scoreToVerdict(65)).toBe('Strong');
    expect(scoreToVerdict(64)).toBe('Good');
    expect(scoreToVerdict(50)).toBe('Good');
    expect(scoreToVerdict(49)).toBe('Mixed');
    expect(scoreToVerdict(35)).toBe('Mixed');
    expect(scoreToVerdict(34)).toBe('Concerning');
    expect(scoreToVerdict(20)).toBe('Concerning');
    expect(scoreToVerdict(19)).toBe('Critical');
    expect(scoreToVerdict(0)).toBe('Critical');
  });
});

describe('Brand Health Score — mention score calculation', () => {
  it('returns null when no mentions', () => {
    expect(calcMentionScore(0, 0, 0)).toBeNull();
  });

  it('returns 100 for all-positive', () => {
    expect(calcMentionScore(100, 0, 0)).toBe(100);
  });

  it('returns 0 for all-negative', () => {
    expect(calcMentionScore(0, 100, 0)).toBe(0);
  });

  it('returns 50 for all-neutral', () => {
    expect(calcMentionScore(0, 0, 100)).toBe(50);
  });

  it('handles mixed sentiment correctly', () => {
    // 60 pos, 20 neg, 20 neutral → (60*100 + 20*50 + 20*0) / 100 = 7000/100 = 70
    expect(calcMentionScore(60, 20, 20)).toBe(70);
  });
});

describe('Brand Health Score — review score calculation', () => {
  it('returns null when no reviews', () => {
    expect(calcReviewScore(null, 0)).toBeNull();
  });

  it('converts 5-star to 100', () => {
    expect(calcReviewScore(5, 10)).toBe(100);
  });

  it('converts 1-star to 0', () => {
    expect(calcReviewScore(1, 10)).toBe(0);
  });

  it('converts 3-star to 50', () => {
    expect(calcReviewScore(3, 10)).toBe(50);
  });

  it('converts 4.5-star correctly', () => {
    // (4.5 - 1) / 4 * 100 = 87.5 → rounds to 88
    expect(calcReviewScore(4.5, 5)).toBe(88);
  });
});

describe('Brand Health Score — combined score weighting', () => {
  it('uses only mention score when no reviews', () => {
    expect(calcOverallScore(70, null)).toBe(70);
  });

  it('uses only review score when no mentions', () => {
    expect(calcOverallScore(null, 80)).toBe(80);
  });

  it('returns null when both are null', () => {
    expect(calcOverallScore(null, null)).toBeNull();
  });

  it('combines with 65/35 weighting', () => {
    // 0.65 * 80 + 0.35 * 60 = 52 + 21 = 73
    expect(calcOverallScore(80, 60)).toBe(73);
  });

  it('returns Excellent verdict when both scores are high', () => {
    const overall = calcOverallScore(90, 85);
    expect(scoreToVerdict(overall)).toBe('Excellent');
  });

  it('returns Mixed verdict for mediocre scores', () => {
    const overall = calcOverallScore(40, 45);
    expect(scoreToVerdict(overall)).toBe('Mixed');
  });
});

// ============================================================================
// CIRCUIT BREAKER TESTS
// Test the CLOSED → OPEN → HALF_OPEN state machine in isolation.
// ============================================================================

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
}

// Inline the circuit breaker logic so tests have no I/O dependency
class TestCircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private lastFailureAt: number | null = null;
  constructor(private cfg: CircuitConfig) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - (this.lastFailureAt ?? 0);
      if (elapsed >= this.cfg.timeout) {
        this.state = 'HALF_OPEN';
        this.successes = 0;
      } else {
        throw new Error('CIRCUIT_OPEN');
      }
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    this.failures = 0;
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.cfg.successThreshold) this.state = 'CLOSED';
    }
  }

  private onFailure() {
    this.failures++;
    this.lastFailureAt = Date.now();
    if (this.state === 'HALF_OPEN' || this.failures >= this.cfg.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  reset() { this.state = 'CLOSED'; this.failures = 0; this.successes = 0; }
  getState() { return this.state; }
  getFailures() { return this.failures; }
}

describe('Circuit Breaker — state transitions', () => {
  it('starts CLOSED', () => {
    const cb = new TestCircuitBreaker({ failureThreshold: 3, successThreshold: 1, timeout: 10_000 });
    expect(cb.getState()).toBe('CLOSED');
  });

  it('opens after failureThreshold consecutive failures', async () => {
    const cb = new TestCircuitBreaker({ failureThreshold: 3, successThreshold: 1, timeout: 60_000 });
    const fail = () => Promise.reject(new Error('boom'));
    for (let i = 0; i < 3; i++) {
      await cb.execute(fail).catch(() => {});
    }
    expect(cb.getState()).toBe('OPEN');
  });

  it('rejects immediately when OPEN (before timeout)', async () => {
    const cb = new TestCircuitBreaker({ failureThreshold: 1, successThreshold: 1, timeout: 60_000 });
    await cb.execute(() => Promise.reject(new Error('x'))).catch(() => {});
    expect(cb.getState()).toBe('OPEN');
    await expect(cb.execute(() => Promise.resolve('ok'))).rejects.toThrow('CIRCUIT_OPEN');
  });

  it('transitions to HALF_OPEN after timeout', async () => {
    const cb = new TestCircuitBreaker({ failureThreshold: 1, successThreshold: 1, timeout: 0 });
    await cb.execute(() => Promise.reject(new Error('x'))).catch(() => {});
    expect(cb.getState()).toBe('OPEN');
    // timeout=0 means it should probe immediately
    await cb.execute(() => Promise.resolve('probe')); // probe succeeds → CLOSED
    expect(cb.getState()).toBe('CLOSED');
  });

  it('re-opens on failure in HALF_OPEN', async () => {
    const cb = new TestCircuitBreaker({ failureThreshold: 1, successThreshold: 2, timeout: 0 });
    await cb.execute(() => Promise.reject(new Error('x'))).catch(() => {});
    // now OPEN → timeout=0 → HALF_OPEN on next call
    await cb.execute(() => Promise.reject(new Error('again'))).catch(() => {});
    expect(cb.getState()).toBe('OPEN');
  });

  it('closes after successThreshold successes in HALF_OPEN', async () => {
    const cb = new TestCircuitBreaker({ failureThreshold: 1, successThreshold: 2, timeout: 0 });
    await cb.execute(() => Promise.reject(new Error('x'))).catch(() => {});
    await cb.execute(() => Promise.resolve('1')); // HALF_OPEN success 1
    expect(cb.getState()).toBe('HALF_OPEN');
    await cb.execute(() => Promise.resolve('2')); // success 2 → CLOSED
    expect(cb.getState()).toBe('CLOSED');
  });

  it('reset() returns circuit to CLOSED', async () => {
    const cb = new TestCircuitBreaker({ failureThreshold: 1, successThreshold: 1, timeout: 60_000 });
    await cb.execute(() => Promise.reject(new Error('x'))).catch(() => {});
    expect(cb.getState()).toBe('OPEN');
    cb.reset();
    expect(cb.getState()).toBe('CLOSED');
  });
});

// ============================================================================
// TTL CACHE TESTS
// Test in-memory TTL cache without any I/O.
// ============================================================================

class TestTtlCache<T = unknown> {
  private store = new Map<string, { value: T; expiresAt: number }>();
  private hits = 0; private misses = 0;
  constructor(private defaultTtlMs = 5000) {}
  get(key: string): T | null {
    const e = this.store.get(key);
    if (!e) { this.misses++; return null; }
    if (Date.now() > e.expiresAt) { this.store.delete(key); this.misses++; return null; }
    this.hits++;
    return e.value;
  }
  set(key: string, value: T, ttlMs = this.defaultTtlMs) {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
  delete(key: string) { this.store.delete(key); }
  flush() { this.store.clear(); }
  invalidatePattern(pattern: string) {
    for (const k of this.store.keys()) if (k.includes(pattern)) this.store.delete(k);
  }
  prune() {
    const now = Date.now(); let n = 0;
    for (const [k, e] of this.store) { if (now > e.expiresAt) { this.store.delete(k); n++; } }
    return n;
  }
  stats() {
    const total = this.hits + this.misses;
    return { size: this.store.size, hits: this.hits, misses: this.misses, hitRate: total > 0 ? Math.round((this.hits / total) * 100) : 0 };
  }
}

describe('TTL Cache', () => {
  it('returns null for missing key', () => {
    const c = new TestTtlCache();
    expect(c.get('nope')).toBeNull();
  });

  it('stores and retrieves a value', () => {
    const c = new TestTtlCache(10_000);
    c.set('k', { score: 82 });
    expect((c.get('k') as any)?.score).toBe(82);
  });

  it('returns null after TTL expires', async () => {
    const c = new TestTtlCache();
    c.set('k', 'val', 1); // 1 ms TTL
    await new Promise(r => setTimeout(r, 10));
    expect(c.get('k')).toBeNull();
  });

  it('increments hit counter on cache hit', () => {
    const c = new TestTtlCache(10_000);
    c.set('k', 42);
    c.get('k');
    expect(c.stats().hits).toBe(1);
    expect(c.stats().misses).toBe(0);
  });

  it('increments miss counter on cache miss', () => {
    const c = new TestTtlCache(10_000);
    c.get('missing');
    expect(c.stats().misses).toBe(1);
  });

  it('calculates hit rate correctly', () => {
    const c = new TestTtlCache(10_000);
    c.set('k', 'v');
    c.get('k'); c.get('k'); c.get('missing');
    // 2 hits, 1 miss → 66%
    expect(c.stats().hitRate).toBe(67);
  });

  it('invalidatePattern removes matching keys', () => {
    const c = new TestTtlCache(10_000);
    c.set('brand:score:30', 1);
    c.set('brand:score:7',  2);
    c.set('trends:30',      3);
    c.invalidatePattern('brand:score');
    expect(c.get('brand:score:30')).toBeNull();
    expect(c.get('brand:score:7')).toBeNull();
    expect(c.get('trends:30')).toBe(3); // unaffected
  });

  it('flush clears all entries', () => {
    const c = new TestTtlCache(10_000);
    c.set('a', 1); c.set('b', 2);
    c.flush();
    expect(c.stats().size).toBe(0);
  });

  it('prune removes only expired entries', async () => {
    const c = new TestTtlCache(10_000);
    c.set('stale', 'x', 1); // 1 ms
    c.set('fresh', 'y', 10_000);
    await new Promise(r => setTimeout(r, 10));
    const pruned = c.prune();
    expect(pruned).toBe(1);
    expect(c.get('fresh')).toBe('y');
  });
});

// ============================================================================
// AUDIENCE SEGMENT LOGIC TESTS
// Test the engagement-tier classification rules in isolation.
// ============================================================================

interface AuthorRow { post_count: number; avg_sent: number }

function classifyTier(r: AuthorRow): 'Power Users' | 'Active' | 'Casual' {
  if (r.post_count >= 5) return 'Power Users';
  if (r.post_count >= 2) return 'Active';
  return 'Casual';
}

function summarisePeriodPct(total: number, positive: number): number {
  return total > 0 ? Math.round((positive / total) * 100) : 0;
}

describe('Audience Segments — engagement tier classification', () => {
  it('classifies author with 5+ posts as Power User', () => {
    expect(classifyTier({ post_count: 5, avg_sent: 0.5 })).toBe('Power Users');
    expect(classifyTier({ post_count: 10, avg_sent: 0.1 })).toBe('Power Users');
  });

  it('classifies author with 2-4 posts as Active', () => {
    expect(classifyTier({ post_count: 2, avg_sent: 0 })).toBe('Active');
    expect(classifyTier({ post_count: 4, avg_sent: -0.2 })).toBe('Active');
  });

  it('classifies author with 1 post as Casual', () => {
    expect(classifyTier({ post_count: 1, avg_sent: 0.8 })).toBe('Casual');
  });

  it('correctly counts authors in each tier', () => {
    const authors: AuthorRow[] = [
      { post_count: 7, avg_sent: 0.4 },
      { post_count: 5, avg_sent: 0.1 },
      { post_count: 3, avg_sent: -0.2 },
      { post_count: 1, avg_sent: 0.5 },
      { post_count: 1, avg_sent: 0.3 },
    ];
    const power  = authors.filter(r => classifyTier(r) === 'Power Users').length;
    const active = authors.filter(r => classifyTier(r) === 'Active').length;
    const casual = authors.filter(r => classifyTier(r) === 'Casual').length;
    expect(power).toBe(2);
    expect(active).toBe(1);
    expect(casual).toBe(2);
  });
});

describe('Audience Segments — time-of-day positive percentage', () => {
  it('returns 0 when no mentions', () => {
    expect(summarisePeriodPct(0, 0)).toBe(0);
  });

  it('returns 100 when all are positive', () => {
    expect(summarisePeriodPct(50, 50)).toBe(100);
  });

  it('returns rounded percentage', () => {
    // 1 out of 3 = 33.33% → rounds to 33
    expect(summarisePeriodPct(3, 1)).toBe(33);
  });

  it('rounds 0.5 correctly', () => {
    // 1 out of 2 = 50
    expect(summarisePeriodPct(2, 1)).toBe(50);
  });
});
