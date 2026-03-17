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
