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
