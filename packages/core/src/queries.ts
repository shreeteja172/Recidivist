import {
  asc,
  clients,
  db,
  desc,
  eq,
  findings,
  memoryCalls,
  repos,
  scans,
  type Finding,
  type Scan,
  type Verdict,
} from "@recidivist/db";
import { getProfile } from "@recidivist/memory";
import { HttpError } from "./errors";
import { severityRank, verdictRank } from "./verdicts";

type ScanCounts = {
  total: number;
  open: number;
  fixed: number;
  bySeverity: Record<"critical" | "high" | "medium" | "low", number>;
  byVerdict: Record<Verdict | "pending", number>;
};

function countFindings(rows: Finding[]): ScanCounts {
  const c: ScanCounts = {
    total: rows.length,
    open: 0,
    fixed: 0,
    bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
    byVerdict: { new: 0, recurring: 0, regression: 0, persistent: 0, pending: 0 },
  };
  for (const f of rows) {
    c[f.status === "fixed" ? "fixed" : "open"]++;
    c.bySeverity[f.severity]++;
    c.byVerdict[f.verdict ?? "pending"]++;
  }
  return c;
}

async function repoFindings(repoId: number) {
  const rows = await db
    .select({ f: findings, s: scans })
    .from(findings)
    .innerJoin(scans, eq(findings.scanId, scans.id))
    .where(eq(scans.repoId, repoId));
  return rows;
}

function scanSummary(scan: Scan, rows: Finding[]) {
  return {
    id: scan.id,
    round: scan.round,
    scannedAt: scan.scannedAt,
    tool: scan.tool,
    stage: scan.stage,
    brief: scan.brief,
    counts: countFindings(rows),
  };
}

/** Home page: one card per client. */
export async function listClients() {
  const list = await db
    .select({ client: clients, repo: repos })
    .from(clients)
    .innerJoin(repos, eq(repos.clientId, clients.id))
    .orderBy(asc(clients.name));

  return Promise.all(
    list.map(async ({ client, repo }) => {
      const scanRows = await db.select().from(scans).where(eq(scans.repoId, repo.id)).orderBy(asc(scans.round));
      const all = await repoFindings(repo.id);
      const summaries = scanRows.map((s) => scanSummary(s, all.filter((r) => r.s.id === s.id).map((r) => r.f)));
      const latest = summaries.at(-1) ?? null;
      const previous = summaries.at(-2) ?? null;
      const trend =
        latest && previous
          ? latest.counts.total > previous.counts.total
            ? "worse"
            : latest.counts.total < previous.counts.total
              ? "better"
              : "flat"
          : "flat";
      return {
        slug: client.slug,
        name: client.name,
        industry: client.industry,
        bankId: client.bankId,
        repo: { name: repo.name, stack: repo.stack },
        scanCount: summaries.length,
        latestScan: latest,
        openFindings: all.filter((r) => r.f.status === "open").length,
        trend,
      };
    }),
  );
}

/** Client page: trend chart numbers (Postgres), rap sheet (Postgres), security profile (Hindsight). */
export async function getClientDetail(slug: string, opts: { withProfile?: boolean } = {}) {
  const [row] = await db
    .select({ client: clients, repo: repos })
    .from(clients)
    .innerJoin(repos, eq(repos.clientId, clients.id))
    .where(eq(clients.slug, slug));
  if (!row) throw new HttpError(404, `Client ${slug} not found`);
  const { client, repo } = row;

  const scanRows = await db.select().from(scans).where(eq(scans.repoId, repo.id)).orderBy(asc(scans.round));
  const all = await repoFindings(repo.id);
  const trend = scanRows.map((s) => scanSummary(s, all.filter((r) => r.s.id === s.id).map((r) => r.f)));

  // Rap sheet: vulnerability classes that showed up in more than one round.
  const byCwe = new Map<string, { cwe: string; cweName: string; rounds: Set<number>; open: number; regressions: number }>();
  for (const { f, s } of all) {
    const e = byCwe.get(f.cwe) ?? { cwe: f.cwe, cweName: f.cweName, rounds: new Set(), open: 0, regressions: 0 };
    e.rounds.add(s.round);
    if (f.status === "open") e.open++;
    if (f.verdict === "regression") e.regressions++;
    byCwe.set(f.cwe, e);
  }
  const rapSheet = [...byCwe.values()]
    .filter((e) => e.rounds.size > 1)
    .map((e) => ({ ...e, rounds: [...e.rounds].sort((a, b) => a - b), occurrences: e.rounds.size }))
    .sort((a, b) => b.occurrences - a.occurrences || b.regressions - a.regressions);

  const profile = opts.withProfile ? await getProfile(client.bankId).catch(() => null) : undefined;

  return {
    client: { slug: client.slug, name: client.name, industry: client.industry, bankId: client.bankId },
    repo: { name: repo.name, stack: repo.stack },
    trend,
    rapSheet,
    profile,
  };
}

export async function getClientProfile(slug: string) {
  const [client] = await db.select().from(clients).where(eq(clients.slug, slug));
  if (!client) throw new HttpError(404, `Client ${slug} not found`);
  return { bankId: client.bankId, profile: await getProfile(client.bankId) };
}

/** Scan results page (also polled while the scan is analyzing). */
export async function getScanDetail(scanId: number) {
  const [row] = await db
    .select({ scan: scans, repo: repos, client: clients })
    .from(scans)
    .innerJoin(repos, eq(scans.repoId, repos.id))
    .innerJoin(clients, eq(repos.clientId, clients.id))
    .where(eq(scans.id, scanId));
  if (!row) throw new HttpError(404, `Scan ${scanId} not found`);

  const rows = await db.select().from(findings).where(eq(findings.scanId, scanId));
  rows.sort(
    (a, b) =>
      (a.verdict ? verdictRank[a.verdict] : 9) - (b.verdict ? verdictRank[b.verdict] : 9) ||
      severityRank[a.severity]! - severityRank[b.severity]! ||
      a.id - b.id,
  );

  const calls = await db
    .select({ op: memoryCalls.op, error: memoryCalls.error })
    .from(memoryCalls)
    .where(eq(memoryCalls.scanId, scanId));
  const count = (op: string) => calls.filter((c) => c.op === op && !c.error).length;

  return {
    scan: {
      id: row.scan.id,
      round: row.scan.round,
      scannedAt: row.scan.scannedAt,
      tool: row.scan.tool,
      stage: row.scan.stage,
      brief: row.scan.brief,
      error: row.scan.error,
      finishedAt: row.scan.finishedAt,
    },
    client: { slug: row.client.slug, name: row.client.name, bankId: row.client.bankId },
    repo: { name: row.repo.name, stack: row.repo.stack },
    progress: {
      findings: rows.length,
      recalls: count("recall"),
      reflects: count("reflect"),
      retains: count("retain"),
    },
    counts: countFindings(rows),
    findings: rows,
  };
}

/** Memory Trace drawer: every Hindsight call, newest last. */
export async function listMemoryCalls(filter: { scanId?: number; clientSlug?: string; limit?: number }) {
  const limit = Math.min(filter.limit ?? 200, 500);
  if (filter.scanId) {
    return db
      .select()
      .from(memoryCalls)
      .where(eq(memoryCalls.scanId, filter.scanId))
      .orderBy(asc(memoryCalls.id))
      .limit(limit);
  }
  if (filter.clientSlug) {
    const [client] = await db.select().from(clients).where(eq(clients.slug, filter.clientSlug));
    if (!client) throw new HttpError(404, `Client ${filter.clientSlug} not found`);
    return db
      .select()
      .from(memoryCalls)
      .where(eq(memoryCalls.clientId, client.id))
      .orderBy(desc(memoryCalls.id))
      .limit(limit);
  }
  return db.select().from(memoryCalls).orderBy(desc(memoryCalls.id)).limit(limit);
}
