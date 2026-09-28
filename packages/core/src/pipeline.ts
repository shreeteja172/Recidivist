import { db, eq, findings, scans, type MemoryEvidence, type ScanStage } from "@recidivist/db";
import {
  ensureProfile,
  recallHistory,
  reflectOnScan,
  retainFindings,
  type ReflectVerdict,
} from "@recidivist/memory";
import { loadHistory, loadScanContext, toMemo } from "./context";
import { decideVerdict } from "./verdicts";

export type PipelineOptions = {
  /** Live uploads retain in the background (fast UI); the seed waits so the next round can recall it. */
  retainAsync?: boolean;
  log?: (msg: string) => void;
};

async function setStage(scanId: number, stage: ScanStage, extra: Partial<typeof scans.$inferInsert> = {}) {
  await db.update(scans).set({ stage, ...extra }).where(eq(scans.id, scanId));
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * The memory-aware scan pipeline:
 *   1. RECALL  history for every finding (before retaining, or findings would find themselves)
 *   2. REFLECT once over the whole scan for verdicts + a brief
 *   3. Combine with exact matches from Postgres and save
 *   4. RETAIN the findings so the next scan remembers them
 */
export async function runPipeline(scanId: number, opts: PipelineOptions = {}) {
  const log = opts.log ?? (() => {});
  const { scan, repo, client, findings: rows } = await loadScanContext(scanId);
  const bankId = client.bankId;
  const trace = { clientId: client.id, scanId };
  const memos = rows.map((f) => toMemo(f, scan, repo));

  try {
    // 1. RECALL
    await setStage(scanId, "recalling", { error: null, finishedAt: null });
    log(`recall ×${memos.length}`);
    let recallFailures = 0;
    const evidence: MemoryEvidence[][] = await mapLimit(memos, 4, (m) =>
      recallHistory(bankId, m, trace).catch((err) => {
        recallFailures++;
        log(`recall failed for ${m.key}: ${err instanceof Error ? err.message : err}`);
        return [];
      }),
    );

    // 2. REFLECT (skipped on a first engagement: there is nothing to remember yet)
    await setStage(scanId, "reflecting");
    const history = await loadHistory(repo.id, scan.round);
    const hasMemory = evidence.some((e) => e.length > 0);
    let reflected: { verdicts: ReflectVerdict[]; brief: string } | null = null;
    let reflectAvailable = recallFailures < memos.length;
    if (hasMemory) {
      log("reflect");
      try {
        reflected = await reflectOnScan(
          bankId,
          { repo: repo.name, round: scan.round, scannedAt: scan.scannedAt, clientName: client.name, findings: memos },
          trace,
        );
      } catch (err) {
        reflectAvailable = false;
        log(`reflect failed, using fallback verdicts: ${err instanceof Error ? err.message : err}`);
      }
    }

    // 3. DECIDE + SAVE
    for (const [i, f] of rows.entries()) {
      const d = decideVerdict(
        { id: f.id, cwe: f.cwe, fingerprint: f.fingerprint },
        history,
        evidence[i] ?? [],
        reflected?.verdicts.find((v) => v.findingId === f.id),
        reflectAvailable,
      );
      await db
        .update(findings)
        .set({ ...d, memoryEvidence: (evidence[i] ?? []).slice(0, 25) })
        .where(eq(findings.id, f.id));
    }
    const brief =
      reflected?.brief ??
      (history.length === 0
        ? `First engagement with ${client.name}: no history yet, so every finding is new. From here on, each scan is judged against this one.`
        : "Memory was unavailable for this scan, so verdicts come from exact matches in past scans only.");
    await db.update(scans).set({ brief }).where(eq(scans.id, scanId));

    // 4. RETAIN
    await setStage(scanId, "retaining");
    log(`retain ×${memos.length}`);
    await retainFindings(bankId, memos, { async: opts.retainAsync ?? true, ...trace });
    await ensureProfile(bankId, repo.name, { refresh: false, ...trace }).catch((err) =>
      log(`profile setup failed: ${err instanceof Error ? err.message : err}`),
    );

    await setStage(scanId, "done", { finishedAt: new Date() });
    log("done");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setStage(scanId, "failed", { error: message, finishedAt: new Date() });
    log(`failed: ${message}`);
    throw err;
  }
}
