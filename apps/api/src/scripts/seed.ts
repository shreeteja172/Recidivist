/**
 * Seed the demo: replays scan rounds 1-3 (and the fixes between them) for every client
 * through the REAL pipeline, with backdated timestamps, so memory builds up exactly as it would in real life.
 * Round 4 is left for the live demo upload.
 *
 *   pnpm seed                       # idempotent: skips rounds that are already done
 *   pnpm seed --reset               # wipe Postgres tables + Hindsight banks first
 *   pnpm seed --client=ledgerly     # one client only
 *   pnpm seed --rounds=2            # stop after round 2
 */
import {
  ClientsFileSchema,
  FixesFileSchema,
  ingestScan,
  markFixed,
  resetAll,
  resetScanVerdicts,
  runPipeline,
  upsertClients,
} from "@recidivist/core";
import { and, closeDb, db, eq, findings, scans, type Client, type Repo } from "@recidivist/db";
import { bankIdFor, consolidateAndWait, ensureProfile, setupBank } from "@recidivist/memory";
import { readDataJson } from "../data";

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const reset = args.includes("--reset");
const onlyClient = flag("client");
const lastRound = Number(flag("rounds") ?? 3);

async function seedClient(client: Client, repo: Repo) {
  const log = (m: string) => console.log(`[${client.slug}] ${m}`);
  const trace = { clientId: client.id };

  log(`setting up memory bank ${client.bankId}`);
  await setupBank({ bankId: client.bankId, clientName: client.name, clientId: client.id });
  const fixes = FixesFileSchema.parse(await readDataJson(`${client.slug}/fixes.json`));

  for (let round = 1; round <= lastRound; round++) {
    const file = await readDataJson(`${client.slug}/round-${round}.json`);
    const [existing] = await db
      .select()
      .from(scans)
      .where(and(eq(scans.repoId, repo.id), eq(scans.round, round)));

    let scanId: number;
    if (existing?.stage === "done") {
      log(`round ${round}: already seeded, skipping`);
      continue;
    } else if (existing) {
      log(`round ${round}: re-running unfinished scan ${existing.id}`);
      await resetScanVerdicts(existing.id);
      scanId = existing.id;
    } else {
      scanId = (await ingestScan(file)).scanId;
    }

    log(`round ${round}: analyzing scan ${scanId}`);
    await runPipeline(scanId, { retainAsync: false, log: (m) => log(`round ${round}: ${m}`) });

    const rows = await db.select().from(findings).where(eq(findings.scanId, scanId));
    const counts = rows.reduce<Record<string, number>>((acc, f) => {
      acc[f.verdict ?? "pending"] = (acc[f.verdict ?? "pending"] ?? 0) + 1;
      return acc;
    }, {});
    log(`round ${round}: verdicts ${JSON.stringify(counts)}`);

    const roundFixes = fixes.flatMap((fx) => {
      const row = rows.find((r) => r.key === fx.key && r.status === "open");
      return row ? [{ findingId: row.id, note: fx.note, fixedAt: new Date(`${fx.fixedAt}T12:00:00Z`) }] : [];
    });
    if (roundFixes.length > 0) {
      log(`round ${round}: retaining ${roundFixes.length} fixes`);
      await markFixed(roundFixes, { retainAsync: false });
    }

    log(`round ${round}: consolidating observations`);
    await consolidateAndWait(client.bankId, trace).catch((err) => log(`consolidation: ${err.message}`));
  }

  log("creating / refreshing the security profile (mental model)");
  await ensureProfile(client.bankId, repo.name, trace).catch((err) => log(`profile: ${err.message}`));
  log("done");
}

async function main() {
  const clientsFile = ClientsFileSchema.parse(await readDataJson("clients.json"));
  const selected = clientsFile.filter((c) => !onlyClient || c.slug === onlyClient);
  if (selected.length === 0) throw new Error(`No client matches --client=${onlyClient}`);

  if (reset) {
    console.log("Resetting Postgres tables and Hindsight banks…");
    await resetAll(clientsFile.map((c) => bankIdFor(c.slug)));
  }

  const targets = await upsertClients(selected);
  const started = Date.now();
  const results = await Promise.allSettled(targets.map(({ client, repo }) => seedClient(client, repo)));
  results.forEach((r, i) => {
    if (r.status === "rejected") console.error(`[${targets[i]!.client.slug}] FAILED:`, r.reason);
  });
  console.log(`Seed finished in ${Math.round((Date.now() - started) / 1000)}s`);
  if (results.some((r) => r.status === "rejected")) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
