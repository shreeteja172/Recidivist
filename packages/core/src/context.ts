import { and, clients, db, eq, findings, lt, repos, scans, type Finding, type Repo, type Scan } from "@recidivist/db";
import type { FindingMemo } from "@recidivist/memory";
import { HttpError } from "./errors";
import type { HistoryRow } from "./verdicts";

export function toMemo(f: Finding, scan: Scan, repo: Repo): FindingMemo {
  return {
    findingId: f.id,
    key: f.key,
    round: scan.round,
    scannedAt: scan.scannedAt,
    repo: repo.name,
    cwe: f.cwe,
    cweName: f.cweName,
    severity: f.severity,
    title: f.title,
    file: f.file,
    line: f.line,
    endpoint: f.endpoint,
    sink: f.sink,
    description: f.description,
  };
}

/** A scan with its repo, client and findings. */
export async function loadScanContext(scanId: number) {
  const [row] = await db
    .select({ scan: scans, repo: repos, client: clients })
    .from(scans)
    .innerJoin(repos, eq(scans.repoId, repos.id))
    .innerJoin(clients, eq(repos.clientId, clients.id))
    .where(eq(scans.id, scanId));
  if (!row) throw new HttpError(404, `Scan ${scanId} not found`);
  const rows = await db.select().from(findings).where(eq(findings.scanId, scanId)).orderBy(findings.id);
  return { ...row, findings: rows };
}

/** Every finding from earlier rounds of the same repo. */
export async function loadHistory(repoId: number, beforeRound: number): Promise<HistoryRow[]> {
  const rows = await db
    .select({ f: findings, s: scans })
    .from(findings)
    .innerJoin(scans, eq(findings.scanId, scans.id))
    .where(and(eq(scans.repoId, repoId), lt(scans.round, beforeRound)));
  return rows.map(({ f, s }) => ({
    findingId: f.id,
    key: f.key,
    round: s.round,
    scannedAt: s.scannedAt,
    cwe: f.cwe,
    file: f.file,
    endpoint: f.endpoint,
    fingerprint: f.fingerprint,
    status: f.status,
    fixedAt: f.fixedAt,
    fixNote: f.fixNote,
  }));
}
