import type { MemoryEvidence, PriorFinding, Verdict } from "@recidivist/db";
import type { ReflectVerdict } from "@recidivist/memory";

/** A finding from an earlier scan of the same repo (from Postgres). */
export type HistoryRow = {
  findingId: number;
  key: string;
  round: number;
  scannedAt: Date;
  cwe: string;
  file: string;
  endpoint: string | null;
  fingerprint: string;
  status: "open" | "fixed";
  fixedAt: Date | null;
  fixNote: string | null;
};

export type CurrentFinding = { id: number; cwe: string; fingerprint: string };

export type Decision = {
  verdict: Verdict;
  /** memory = Hindsight reflect, exact-match = same fingerprint in Postgres, fallback = Hindsight unavailable */
  verdictSource: "memory" | "exact-match" | "fallback";
  priorFindings: PriorFinding[];
  occurrence: number;
  rootCause: string | null;
  durableFix: string | null;
};

const toPrior = (h: HistoryRow): PriorFinding => ({
  findingId: h.findingId,
  key: h.key,
  round: h.round,
  scannedAt: h.scannedAt.toISOString(),
  file: h.file,
  endpoint: h.endpoint,
  status: h.status,
  fixedAt: h.fixedAt?.toISOString() ?? null,
  fixNote: h.fixNote,
});

const byRound = (a: HistoryRow, b: HistoryRow) => a.round - b.round || a.findingId - b.findingId;

/**
 * Combine Hindsight's judgement with hard facts from Postgres.
 *
 * - Exact same issue (fingerprint) seen before: regression if it was fixed, persistent if still open.
 *   This is deterministic, so memory can't get it wrong.
 * - Otherwise Hindsight reflect decides (it spots the same root cause in a different file/endpoint).
 * - Every prior round shown in the UI must be backed by a real earlier finding ("every claim has a receipt").
 *   If reflect claims history that no earlier finding backs up, the verdict falls back to "new".
 * - If reflect was unavailable, fall back to "same CWE seen before = recurring".
 */
export function decideVerdict(
  finding: CurrentFinding,
  history: HistoryRow[],
  evidence: MemoryEvidence[],
  reflected: ReflectVerdict | undefined,
  reflectAvailable: boolean,
): Decision {
  const text = { rootCause: reflected?.rootCause ?? null, durableFix: reflected?.durableFix ?? null };
  const exact = history.filter((h) => h.fingerprint === finding.fingerprint).sort(byRound);
  const sameClass = history.filter((h) => h.cwe === finding.cwe).sort(byRound);

  if (exact.length > 0) {
    const latest = exact[exact.length - 1]!;
    return finish(latest.status === "fixed" ? "regression" : "persistent", "exact-match", exact, text);
  }

  if (!reflectAvailable) {
    return sameClass.length > 0
      ? finish("recurring", "fallback", sameClass, text)
      : finish("new", "fallback", [], text);
  }

  if (!reflected || reflected.verdict === "new") return finish("new", "memory", [], text);

  const claimed = new Set(reflected.priorRounds);
  const recalledRounds = new Set(evidence.map((e) => e.round).filter((r): r is number => r !== null));
  let receipts = sameClass.filter((h) => claimed.has(h.round));
  if (receipts.length === 0) receipts = sameClass.filter((h) => recalledRounds.has(h.round));
  if (receipts.length === 0) receipts = sameClass;
  if (receipts.length === 0) return finish("new", "memory", [], text);

  return finish(reflected.verdict, "memory", receipts, text);
}

function finish(
  verdict: Verdict,
  verdictSource: Decision["verdictSource"],
  priors: HistoryRow[],
  text: { rootCause: string | null; durableFix: string | null },
): Decision {
  const rounds = new Set(priors.map((p) => p.round));
  return {
    verdict,
    verdictSource,
    priorFindings: priors.map(toPrior),
    occurrence: rounds.size + 1,
    ...text,
  };
}

/** Sort order for the results page: the scariest news first. */
export const verdictRank: Record<Verdict, number> = { regression: 0, recurring: 1, persistent: 2, new: 3 };
export const severityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
