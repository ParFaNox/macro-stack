import type { AgentLogStatus, AgentLogStep, AgentReasoningLog } from '@/types';

/**
 * Reasoning-log helpers.
 *
 * These feed Teammate 1's <AgentReasoningFeed>, which renders `step`,
 * `timestamp`, `message` and a pretty-printed `metadata` block. Messages are
 * written to read well in that terminal panel: short, present-tense, and with
 * the interesting numbers pushed into `metadata` rather than the sentence.
 */

export function createLog(
  step: AgentLogStep,
  status: AgentLogStatus,
  message: string,
  metadata?: Record<string, unknown>,
): AgentReasoningLog {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    step,
    status,
    message,
    ...(metadata ? { metadata } : {}),
  };
}

/**
 * Accumulates logs for the JSON response while optionally forwarding each one
 * to a live subscriber (the SSE stream in /api/optimize). One collector serves
 * both response shapes, so the streaming and non-streaming paths can never
 * drift apart.
 */
export class ReasoningLogCollector {
  private readonly logs: AgentReasoningLog[] = [];
  private subscriber?: (log: AgentReasoningLog) => void;

  onLog(subscriber: (log: AgentReasoningLog) => void): void {
    this.subscriber = subscriber;
  }

  push(
    step: AgentLogStep,
    status: AgentLogStatus,
    message: string,
    metadata?: Record<string, unknown>,
  ): AgentReasoningLog {
    const log = createLog(step, status, message, metadata);
    this.logs.push(log);
    this.subscriber?.(log);
    return log;
  }

  all(): AgentReasoningLog[] {
    return [...this.logs];
  }
}
