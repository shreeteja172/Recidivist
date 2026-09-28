import { and, clients, db, eq, findings, repos, scans } from "@recidivist/db";
import { bankIdFor } from "@recidivist/memory";
import { HttpError } from "./errors";
import { fingerprint, ScanFileSchema, type ClientsFile } from "./scan-schema";

/** Create (or update) the clients and repos listed in data/clients.json. */
export async function upsertClients(list: ClientsFile) {
  const out = [];
  for (const c of list) {
    const [client] = await db
      .insert(clients)
      .values({ slug: c.slug, name: c.name, industry: c.industry, prefix: c.prefix, bankId: bankIdFor(c.slug) })
      .onConflictDoUpdate({
        target: clients.slug,
        set: { name: c.name, industry: c.industry, prefix: c.prefix },
      })
      .returning();
    const [repo] = await db
      .insert(repos)
      .values({ clientId: client!.id, name: c.repo, stack: c.stack })
      .onConflictDoUpdate({ target: repos.name, set: { stack: c.stack } })
      .returning();
    out.push({ client: client!, repo: repo! });
  }
  return out;
}

/** Validate an uploaded scan and store it with its findings. Memory work happens in runPipeline. */
export async function ingestScan(input: unknown): Promise<{ scanId: number }> {
  const parsed = ScanFileSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, "Invalid scan file", parsed.error.issues);
  const scan = parsed.data;

  const [target] = await db
    .select({ client: clients, repo: repos })
    .from(repos)
    .innerJoin(clients, eq(repos.clientId, clients.id))
    .where(and(eq(clients.slug, scan.client), eq(repos.name, scan.repo)));
  if (!target) throw new HttpError(404, `Unknown client/repo: ${scan.client} / ${scan.repo}`);

  const [existing] = await db
    .select({ id: scans.id })
    .from(scans)
    .where(and(eq(scans.repoId, target.repo.id), eq(scans.round, scan.round)));
  if (existing) {
    throw new HttpError(409, `Round ${scan.round} of ${scan.repo} already exists (scan ${existing.id}). Delete it to re-upload.`, {
      scanId: existing.id,
    });
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(scans)
      .values({ repoId: target.repo.id, round: scan.round, scannedAt: new Date(scan.scannedAt), tool: scan.tool })
      .returning({ id: scans.id });
    await tx.insert(findings).values(
      scan.findings.map((f) => ({
        scanId: row!.id,
        key: f.key,
        ruleId: f.ruleId,
        cwe: f.cwe,
        cweName: f.cweName,
        severity: f.severity,
        title: f.title,
        file: f.file,
        line: f.line,
        endpoint: f.endpoint,
        sink: f.sink,
        description: f.description,
        fingerprint: fingerprint(f),
      })),
    );
    return { scanId: row!.id };
  });
}
