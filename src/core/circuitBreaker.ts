/**
 * Circuit Breaker — production-grade fault-tolerance primitive.
 *
 * State machine:
 *
 *   CLOSED ──(N failures)──→ OPEN ──(timeout)──→ HALF_OPEN
 *     ↑                                               │
 *     └──────────(M consecutive successes)────────────┘
 *
 * CLOSED:    All requests flow through normally.
 * OPEN:      All requests are immediately rejected; no calls to the
 *            downstream service.  Transitions to HALF_OPEN after `timeout` ms.
 * HALF_OPEN: One probe request is allowed through.  A success transitions
 *            back to CLOSED; a failure re-opens the circuit.
 */

import { logger } from './logger.js';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitConfig {
  /** Consecutive failures before the circuit opens. Default: 5 */
  failureThreshold: number;
  /** Consecutive successes in HALF_OPEN before closing. Default: 2 */
  successThreshold: number;
  /** Milliseconds to wait in OPEN state before probing. Default: 60 000 */
  timeout: number;
}

export interface CircuitStatus {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureAt: number | null;
  totalRequests: number;
  totalFailures: number;
}

const DEFAULT_CONFIG: CircuitConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60_000,
};

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private lastFailureAt: number | null = null;
  private totalRequests = 0;
  private totalFailures = 0;
  private readonly cfg: CircuitConfig;

  constructor(
    private readonly name: string,
    config: Partial<CircuitConfig> = {},
  ) {
    this.cfg = { ...DEFAULT_CONFIG, ...config };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - (this.lastFailureAt ?? 0);
      if (elapsed >= this.cfg.timeout) {
        logger.info(`Circuit '${this.name}': OPEN → HALF_OPEN (probe allowed)`);
        this.state = 'HALF_OPEN';
        this.successes = 0;
      } else {
        const waitSec = Math.ceil((this.cfg.timeout - elapsed) / 1000);
        throw new Error(
          `Circuit '${this.name}' is OPEN — ${waitSec}s remaining before probe`,
        );
      }
    }

    this.totalRequests++;
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err as Error);
      throw err;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.cfg.successThreshold) {
        logger.info(`Circuit '${this.name}': HALF_OPEN → CLOSED`);
        this.state = 'CLOSED';
      }
    }
  }

  private onFailure(err: Error): void {
    this.failures++;
    this.totalFailures++;
    this.lastFailureAt = Date.now();

    if (
      this.state === 'HALF_OPEN' ||
      this.failures >= this.cfg.failureThreshold
    ) {
      logger.warn(
        `Circuit '${this.name}': → OPEN after ${this.failures} failure(s): ${err.message}`,
      );
      this.state = 'OPEN';
    }
  }

  /** Manually close (e.g. after manual remediation). */
  reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureAt = null;
    logger.info(`Circuit '${this.name}': manually RESET to CLOSED`);
  }

  getStatus(): CircuitStatus {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureAt: this.lastFailureAt,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
    };
  }
}

// ── Global registry ──────────────────────────────────────────────────────────

const registry = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(
  name: string,
  config?: Partial<CircuitConfig>,
): CircuitBreaker {
  if (!registry.has(name)) {
    registry.set(name, new CircuitBreaker(name, config));
  }
  return registry.get(name)!;
}

export function getAllCircuitStatus(): CircuitStatus[] {
  return [...registry.values()].map(b => b.getStatus());
}
