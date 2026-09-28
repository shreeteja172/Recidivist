import { clients, db, eq, findings, inArray, repos, scans } from "@recidivist/db";
import { retainFixes } from "@recidivist/memory";
import { toMemo } from "./context";
import { HttpError } from "./errors";

type FixInput = { findingId: number; note: string; fixedAt?: Date };

/**
 * Mark findings fixed in Postgres and retain the fix notes in memory.
 * The note ("what changed and what didn't") is what later lets reflect say "you fixed the endpoint, not the helper".
 */
export async function markFixed(fixes: FixInput[], opts: { retainAsync?: boolean } = {}) {
  if (fixes.length === 0) return [];
  const ids = fixes.map((f) => f.findingId);
  const rows = await db
    .select({ f: findings, scan: scans, repo: repos, client: clients })
    .from(findings)
    .innerJoin(scans, eq(findings.scanId, scans.id))
    .innerJoin(repos, eq(scans.repoId, repos.id))
    .innerJoin(clients, eq(repos.clientId, clients.id))
    .where(inArray(findings.id, ids));
  if (rows.length !== ids.length) throw new HttpError(404, "Finding not found");
  const bankIds = new Set(rows.map((r) => r.client.bankId));
  if (bankIds.size !== 1) throw new HttpError(400, "Fixes must belong to one client");

  const memos = [];
  const updated = [];
  for (const fix of fixes) {
    const row = rows.find((r) => r.f.id === fix.findingId)!;
    const fixedAt = fix.fixedAt ?? new Date();
    const [u] = await db
      .update(findings)
      .set({ status: "fixed", fixedAt, fixNote: fix.note })
      .where(eq(findings.id, fix.findingId))
      .returning();
    updated.push(u!);
    memos.push({ finding: toMemo(row.f, row.scan, row.repo), fixedAt, note: fix.note });
  }

  const { client } = rows[0]!;
  await retainFixes(client.bankId, memos, {
    async: opts.retainAsync ?? true,
    clientId: client.id,
    scanId: fixes.length === 1 ? rows[0]!.scan.id : undefined,
  });
  return updated;
}
