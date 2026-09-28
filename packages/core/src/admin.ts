import { clients, db, eq, findings, memoryCalls, repos, scans, sql } from "@recidivist/db";
import { deleteBank, forgetFindings } from "@recidivist/memory";
import { loadScanContext } from "./context";

/** Delete a scan and forget its findings in memory, so a demo round can be re-uploaded. */
export async function deleteScan(scanId: number) {
  const { client, findings: rows } = await loadScanContext(scanId);
  let memoryError: string | null = null;
  try {
    await forgetFindings(
      client.bankId,
      rows.map((f) => f.id),
    );
  } catch (err) {
    memoryError = err instanceof Error ? err.message : String(err);
  }
  await db.delete(scans).where(eq(scans.id, scanId));
  return { deleted: scanId, forgotten: memoryError ? 0 : rows.length, memoryError };
}

/** Reset the scan's verdicts so the pipeline can run again (e.g. after Hindsight was down). */
export async function resetScanVerdicts(scanId: number) {
  await db
    .update(findings)
    .set({
      verdict: null,
      verdictSource: null,
      occurrence: 1,
      priorFindings: [],
      rootCause: null,
      durableFix: null,
      memoryEvidence: [],
    })
    .where(eq(findings.scanId, scanId));
  await db.update(scans).set({ stage: "saved", brief: null, error: null, finishedAt: null }).where(eq(scans.id, scanId));
}

/** Wipe everything: app tables and the clients' Hindsight banks. */
export async function resetAll(bankIds: string[]) {
  for (const bankId of bankIds) await deleteBank(bankId);
  await db.execute(
    sql`TRUNCATE ${memoryCalls}, ${findings}, ${scans}, ${repos}, ${clients} RESTART IDENTITY CASCADE`,
  );
}
