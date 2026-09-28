import type { MemoryEvidence, Verdict } from "@recidivist/db";
import type { MemoryItemInput, RecallResponse, RecallResult, ReflectResponse } from "@vectorize-io/hindsight-client";
import { isNotFound, repoTag } from "./bank";
import { hs } from "./client";
import { traced } from "./trace";

/** Everything memory needs to know about one finding. */
export type FindingMemo = {
  findingId: number;
  key: string;
  round: number;
  scannedAt: Date;
  repo: string;
  cwe: string;
  cweName: string;
  severity: string;
  title: string;
  file: string;
  line: number;
  endpoint: string | null;
  sink: string | null;
  description: string;
};

type Trace = { clientId?: number; scanId?: number };

const day = (d: Date) => d.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// RETAIN
// ---------------------------------------------------------------------------

/** Findings are retained as plain sentences: Hindsight extracts facts from text, not JSON. */
export function findingNarrative(f: FindingMemo) {
  return [
    `Scan round ${f.round} (${day(f.scannedAt)}) of ${f.repo} reported a ${f.severity.toUpperCase()} ${f.cweName} (${f.cwe}) finding: ${f.title}.`,
    `Location: ${f.file} line ${f.line}${f.endpoint ? `, endpoint ${f.endpoint}` : ""}.`,
    f.sink ? `The vulnerable data flow goes through ${f.sink}.` : "",
    f.description,
  ]
    .filter(Boolean)
    .join(" ");
}

function findingEntities(f: FindingMemo) {
  const entities = [
    { text: `${f.cwe} ${f.cweName}`, type: "vulnerability_class" },
    { text: f.file, type: "file" },
  ];
  if (f.endpoint) entities.push({ text: f.endpoint, type: "endpoint" });
  if (f.sink) entities.push({ text: f.sink.split(" in ")[0]!, type: "code_path" });
  return entities;
}

/** Retain all findings of a scan in one batch call. One document per finding, so re-seeding never duplicates. */
export async function retainFindings(
  bankId: string,
  findings: FindingMemo[],
  opts: { async?: boolean } & Trace = {},
) {
  if (findings.length === 0) return;
  const items: MemoryItemInput[] = findings.map((f) => ({
    content: findingNarrative(f),
    timestamp: f.scannedAt,
    context: `Security finding from automated scan round ${f.round} of ${f.repo}`,
    document_id: `finding-${f.findingId}`,
    tags: [repoTag(f.repo)],
    metadata: {
      kind: "finding",
      findingId: String(f.findingId),
      key: f.key,
      round: String(f.round),
      cwe: f.cwe,
      severity: f.severity,
      file: f.file,
    },
    entities: findingEntities(f),
  }));
  const first = findings[0]!;
  await traced(
    {
      op: "retain",
      bankId,
      label: `retain ${findings.length} findings · round ${first.round}`,
      request: { items: items.map(({ content, document_id, tags, metadata }) => ({ content, document_id, tags, metadata })) },
      ...opts,
    },
    () => hs().retainBatch(bankId, items, { async: opts.async ?? false }),
  );
}

export type FixMemo = { finding: FindingMemo; fixedAt: Date; note: string };

export function fixNarrative({ finding: f, fixedAt, note }: FixMemo) {
  return (
    `On ${day(fixedAt)} the team marked the ${f.cweName} (${f.cwe}) finding from scan round ${f.round} ` +
    `in ${f.endpoint ?? f.file} (${f.file}) as FIXED. Remediation: ${note}`
  );
}

function fixItem(fix: FixMemo): MemoryItemInput {
  const f = fix.finding;
  return {
    content: fixNarrative(fix),
    timestamp: fix.fixedAt,
    context: `Remediation record for a security finding in ${f.repo}`,
    document_id: `fix-${f.findingId}`,
    tags: [repoTag(f.repo)],
    metadata: { kind: "fix", findingId: String(f.findingId), key: f.key, round: String(f.round), cwe: f.cwe },
    entities: findingEntities(f),
  };
}

/** Retain fix events. The fix note ("what was and wasn't changed") is what lets reflect spot fixes of the wrong layer. */
export async function retainFixes(bankId: string, fixes: FixMemo[], opts: { async?: boolean } & Trace = {}) {
  if (fixes.length === 0) return;
  const items = fixes.map(fixItem);
  const label = fixes.length === 1 ? `retain fix · ${fixes[0]!.finding.key}` : `retain ${fixes.length} fixes`;
  await traced(
    {
      op: "retain",
      bankId,
      label,
      request: { items: items.map(({ content, document_id, metadata }) => ({ content, document_id, metadata })) },
      findingId: fixes.length === 1 ? fixes[0]!.finding.findingId : undefined,
      ...opts,
    },
    () => hs().retainBatch(bankId, items, { async: opts.async ?? false }),
  );
}

/** Remove a finding's memories (used when a demo scan is deleted and re-uploaded). */
export async function forgetFindings(bankId: string, findingIds: number[]) {
  for (const id of findingIds) {
    for (const documentId of [`finding-${id}`, `fix-${id}`]) {
      try {
        await hs().deleteDocument(bankId, documentId);
      } catch (err) {
        if (!isNotFound(err)) throw err;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// RECALL
// ---------------------------------------------------------------------------

export function recallQuery(f: FindingMemo) {
  const where = [f.sink ? `through ${f.sink}` : "", `in ${f.file}`, f.endpoint ? `or endpoint ${f.endpoint}` : ""]
    .filter(Boolean)
    .join(" ");
  return `Earlier findings, fixes and regressions involving ${f.cweName} (${f.cwe}) ${where}`;
}

function toEvidence(r: RecallResult): MemoryEvidence {
  const round = Number(r.metadata?.round);
  const findingId = Number(r.metadata?.findingId);
  return {
    id: r.id,
    text: r.text,
    type: r.type ?? null,
    kind: r.metadata?.kind ?? null,
    round: Number.isFinite(round) ? round : null,
    findingId: Number.isFinite(findingId) ? findingId : null,
    occurredAt: r.occurred_start ?? r.mentioned_at ?? null,
  };
}

/** Results plus the source facts behind any observations, de-duplicated. */
function flattenRecall(res: RecallResponse): MemoryEvidence[] {
  const seen = new Map<string, MemoryEvidence>();
  for (const r of res.results) seen.set(r.id, toEvidence(r));
  for (const r of Object.values(res.source_facts ?? {})) if (!seen.has(r.id)) seen.set(r.id, toEvidence(r));
  return [...seen.values()];
}

/** Ask memory about one finding's history. Runs BEFORE the finding is retained, or it would find itself. */
export async function recallHistory(bankId: string, f: FindingMemo, trace: Trace = {}): Promise<MemoryEvidence[]> {
  const query = recallQuery(f);
  const options = {
    tags: [repoTag(f.repo)],
    tagsMatch: "all_strict" as const,
    types: ["world", "observation"],
    includeSourceFacts: true,
    budget: "mid" as const,
    maxTokens: 2048,
    queryTimestamp: f.scannedAt.toISOString(),
  };
  const res = await traced(
    { op: "recall", bankId, label: `recall · ${f.key}`, request: { query, ...options }, findingId: f.findingId, ...trace },
    () => hs().recall(bankId, query, options),
    (r) => ({ count: r.results.length, evidence: flattenRecall(r).slice(0, 25) }),
  );
  return flattenRecall(res);
}

// ---------------------------------------------------------------------------
// REFLECT
// ---------------------------------------------------------------------------

export type ReflectVerdict = {
  findingId: number;
  verdict: Verdict;
  priorRounds: number[];
  rootCause: string | null;
  durableFix: string | null;
};

const verdictSchema = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          findingId: { type: "integer", description: "The id in square brackets" },
          verdict: { type: "string", enum: ["new", "recurring", "regression", "persistent"] },
          priorRounds: { type: "array", items: { type: "integer" }, description: "Earlier scan rounds of the same issue or root cause" },
          rootCause: { type: "string", description: "The shared root cause, one sentence" },
          durableFix: { type: "string", description: "The fix that would stop this class coming back, one sentence" },
        },
        required: ["findingId", "verdict", "priorRounds"],
      },
    },
    brief: { type: "string", description: "2-3 sentences on what this scan says about the team's security habits" },
  },
  required: ["findings", "brief"],
};

export function reflectPrompt(repo: string, round: number, scannedAt: Date, findings: FindingMemo[]) {
  const lines = findings.map(
    (f) =>
      `[${f.findingId}] ${f.severity.toUpperCase()} ${f.cwe} ${f.cweName}: ${f.title}. ${f.file}` +
      `${f.endpoint ? `, ${f.endpoint}` : ""}${f.sink ? `, via ${f.sink}` : ""}`,
  );
  return [
    `A new security scan (round ${round}, ${day(scannedAt)}) of ${repo} reported these findings:`,
    "",
    ...lines,
    "",
    "Using this client's history of findings and fixes, classify EVERY finding above:",
    '- "new": nothing like it before',
    '- "recurring": same vulnerability class and root cause (for example the same shared helper or template pattern) seen in an earlier round, even in a different file or endpoint',
    '- "regression": the same issue was previously marked fixed and has come back',
    '- "persistent": the same issue was reported before and never fixed',
    "For anything not new, list the earlier scan rounds, the shared root cause, and the durable fix.",
    "Finally write a short brief about what this scan says about the team's security habits.",
  ].join("\n");
}

export async function reflectOnScan(
  bankId: string,
  input: { repo: string; round: number; scannedAt: Date; clientName: string; findings: FindingMemo[] },
  trace: Trace = {},
): Promise<{ verdicts: ReflectVerdict[]; brief: string; text: string }> {
  const query = reflectPrompt(input.repo, input.round, input.scannedAt, input.findings);
  const options = {
    context: `Triage of scan round ${input.round} for ${input.clientName}`,
    tags: [repoTag(input.repo)],
    tagsMatch: "all_strict" as const,
    budget: "mid" as const,
    includeFacts: true,
    responseSchema: verdictSchema,
  };
  const res: ReflectResponse = await traced(
    { op: "reflect", bankId, label: `reflect · round ${input.round} triage`, request: { query, ...options }, ...trace },
    () => hs().reflect(bankId, query, options),
    (r) => ({
      text: r.text,
      structured_output: r.structured_output,
      structured_output_error: r.structured_output_error,
      based_on: summarizeBasedOn(r),
      usage: r.usage,
    }),
  );

  const out = res.structured_output as { findings?: unknown[]; brief?: unknown } | null | undefined;
  if (!out || !Array.isArray(out.findings)) {
    throw new Error(`reflect returned no structured output: ${res.structured_output_error ?? "unknown"}`);
  }
  const validVerdicts = new Set(["new", "recurring", "regression", "persistent"]);
  const verdicts: ReflectVerdict[] = [];
  for (const raw of out.findings) {
    const v = raw as Record<string, unknown>;
    const findingId = Number(v.findingId);
    if (!Number.isFinite(findingId) || !validVerdicts.has(String(v.verdict))) continue;
    verdicts.push({
      findingId,
      verdict: v.verdict as Verdict,
      priorRounds: Array.isArray(v.priorRounds) ? v.priorRounds.map(Number).filter(Number.isFinite) : [],
      rootCause: typeof v.rootCause === "string" && v.rootCause ? v.rootCause : null,
      durableFix: typeof v.durableFix === "string" && v.durableFix ? v.durableFix : null,
    });
  }
  return { verdicts, brief: typeof out.brief === "string" ? out.brief : res.text, text: res.text };
}

function summarizeBasedOn(r: ReflectResponse) {
  const b = r.based_on as Record<string, unknown> | null | undefined;
  if (!b) return null;
  const pick = (list: unknown) =>
    Array.isArray(list)
      ? list.slice(0, 20).map((m) => {
          const x = m as Record<string, unknown>;
          return { id: x.id, text: x.text ?? x.content ?? x.name, type: x.type ?? x.fact_type };
        })
      : [];
  return { memories: pick(b.memories), mental_models: pick(b.mental_models), directives: pick(b.directives) };
}

// ---------------------------------------------------------------------------
// MENTAL MODEL: the client security profile (auto-refreshes after consolidation)
// ---------------------------------------------------------------------------

export const PROFILE_ID = "security-profile";
const PROFILE_QUERY =
  "Summarize this client's security track record across all scan rounds: which vulnerability classes keep " +
  "recurring and why (shared root causes), which fixes held, which regressed, what remediation habits the team " +
  "shows, and the top 3 durable fixes to prioritize. Cite scan rounds and dates.";

/** Create the profile if missing; otherwise refresh it (unless refresh: false). */
export async function ensureProfile(bankId: string, repo: string, opts: Trace & { refresh?: boolean } = {}) {
  const { refresh = true, ...trace } = opts;
  try {
    await hs().getMentalModel(bankId, PROFILE_ID, { detail: "metadata" });
  } catch (err) {
    if (!isNotFound(err)) throw err;
    const options = {
      id: PROFILE_ID,
      tags: [repoTag(repo)],
      maxTokens: 1200,
      trigger: { refreshAfterConsolidation: true },
    };
    return traced(
      { op: "mental_model", bankId, label: "create security profile", request: { sourceQuery: PROFILE_QUERY, ...options }, ...trace },
      () => hs().createMentalModel(bankId, "Client security profile", PROFILE_QUERY, options),
    );
  }
  if (refresh) return refreshProfile(bankId, trace);
}

export async function refreshProfile(bankId: string, trace: Trace = {}) {
  return traced({ op: "mental_model", bankId, label: "refresh security profile", request: { id: PROFILE_ID }, ...trace }, () =>
    hs().refreshMentalModel(bankId, PROFILE_ID),
  );
}

export type Profile = {
  content: string | null;
  lastRefreshedAt: string | null;
  isStale: boolean;
};

export async function getProfile(bankId: string): Promise<Profile | null> {
  try {
    const mm = await hs().getMentalModel(bankId, PROFILE_ID, { detail: "content" });
    return {
      content: mm.content ?? null,
      lastRefreshedAt: mm.last_refreshed_at ?? null,
      isStale: Boolean(mm.is_stale),
    };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}
