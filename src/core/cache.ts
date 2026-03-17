/**
 * In-memory TTL cache for hot API responses.
 *
 * Production rationale: avoids round-tripping SQLite for every request to
 * high-frequency read endpoints (/api/stats, /api/trends, /api/brand/score …).
 * Entries expire automatically; a background prune runs every minute to
 * reclaim memory from stale keys.
 *
 * Usage:
 *   import { apiCache } from './cache.js';
 *
 *   const key = 'brand:score:30';
 *   let data = apiCache.get(key);
 *   if (!data) {
 *     data = computeExpensiveThing();
 *     apiCache.set(key, data, 5 * 60 * 1000);   // 5-minute TTL
 *   }
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
}

export class TtlCache<T = unknown> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private hitCount = 0;
  private missCount = 0;

  constructor(private readonly defaultTtlMs = 5 * 60 * 1000) {}

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.missCount++;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.missCount++;
      return null;
    }
    this.hitCount++;
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number = this.defaultTtlMs): void {
    const now = Date.now();
    this.store.set(key, { value, expiresAt: now + ttlMs, createdAt: now });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  /** Remove all keys whose string contains `pattern`. */
  invalidatePattern(pattern: string): void {
    for (const key of this.store.keys()) {
      if (key.includes(pattern)) this.store.delete(key);
    }
  }

  flush(): void {
    this.store.clear();
  }

  /** Remove expired entries and return the number pruned. */
  prune(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        pruned++;
      }
    }
    return pruned;
  }

  stats(): { size: number; hits: number; misses: number; hitRate: number } {
    const total = this.hitCount + this.missCount;
    return {
      size: this.store.size,
      hits: this.hitCount,
      misses: this.missCount,
      hitRate: total > 0 ? Math.round((this.hitCount / total) * 100) : 0,
    };
  }
}

// ── Shared singleton ─────────────────────────────────────────────────────────
// Single cache instance used by all API routes.  TTL defaults to 5 minutes;
// individual routes may override per-key.

export const apiCache = new TtlCache(5 * 60 * 1000);

// Background pruning — run every 60 s to keep memory bounded.
setInterval(() => {
  apiCache.prune();
}, 60_000);
