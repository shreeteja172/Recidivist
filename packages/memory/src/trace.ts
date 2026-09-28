import { db, memoryCalls, type MemoryOp } from "@recidivist/db";

export type TraceMeta = {
  op: MemoryOp;
  bankId: string;
  /** Short human label for the Memory Trace drawer, e.g. "recall · NW-R4-01". */
  label: string;
  request: unknown;
  clientId?: number;
  scanId?: number;
  findingId?: number;
};

/**
 * Runs a Hindsight call and logs it to memory_calls (request, trimmed response, latency, error).
 * Logging failures never break the memory call itself.
 */
export async function traced<T>(
  meta: TraceMeta,
  fn: () => Promise<T>,
  summarize: (result: T) => unknown = (r) => r,
): Promise<T> {
  const started = performance.now();
  try {
    const result = await fn();
    await log(meta, started, { response: summarize(result) });
    return result;
  } catch (err) {
    await log(meta, started, { error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

async function log(meta: TraceMeta, started: number, outcome: { response?: unknown; error?: string }) {
  try {
    await db.insert(memoryCalls).values({
      op: meta.op,
      bankId: meta.bankId,
      label: meta.label,
      request: meta.request ?? {},
      response: outcome.response ?? null,
      error: outcome.error ?? null,
      latencyMs: Math.round(performance.now() - started),
      clientId: meta.clientId,
      scanId: meta.scanId,
      findingId: meta.findingId,
    });
  } catch (err) {
    console.warn("[memory] failed to log memory call:", err);
  }
}
