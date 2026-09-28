/**
 * Validate the synthetic dataset in data/ (schema, fix dates, keys) and preview the
 * deterministic verdicts (exact same issue seen before = regression / persistent).
 *
 *   pnpm --filter @recidivist/api check-data
 */
import { ClientsFileSchema, fingerprint, FixesFileSchema, ScanFileSchema, type ScanFile } from "@recidivist/core";
import { readDataJson } from "../data";

const ROUNDS = [1, 2, 3, 4];
let problems = 0;
const fail = (msg: string) => {
  problems++;
  console.error(`  ✗ ${msg}`);
};

async function main() {
  const clients = ClientsFileSchema.parse(await readDataJson("clients.json"));
  for (const c of clients) {
    console.log(`\n${c.name} (${c.repo})`);
    const scans: ScanFile[] = [];
    for (const round of ROUNDS) {
      const parsed = ScanFileSchema.safeParse(await readDataJson(`${c.slug}/round-${round}.json`));
      if (!parsed.success) {
        fail(`round-${round}.json: ${parsed.error.message}`);
        continue;
      }
      const s = parsed.data;
      if (s.client !== c.slug || s.repo !== c.repo || s.round !== round) fail(`round-${round}.json header mismatch`);
      for (const f of s.findings) {
        if (!f.key.startsWith(`${c.prefix}-R${round}-`)) fail(`${f.key} has the wrong prefix for round ${round}`);
      }
      scans.push(s);
    }

    const fixes = FixesFileSchema.parse(await readDataJson(`${c.slug}/fixes.json`));
    const fixedKeys = new Set<string>();
    for (const fx of fixes) {
      const scan = scans.find((s) => s.findings.some((f) => f.key === fx.key));
      if (!scan) {
        fail(`fix for unknown key ${fx.key}`);
        continue;
      }
      const next = scans.find((s) => s.round === scan.round + 1);
      const at = new Date(`${fx.fixedAt}T12:00:00Z`);
      if (at <= new Date(scan.scannedAt) || (next && at >= new Date(next.scannedAt))) {
        fail(`${fx.key} fixedAt ${fx.fixedAt} is outside round ${scan.round}'s fix window`);
      }
      if (scan.round === 4) fail(`${fx.key}: round 4 is the live demo scan and should have no fixes`);
      fixedKeys.add(fx.key);
    }

    const seen: Array<{ key: string; round: number; fp: string; cwe: string; fixed: boolean }> = [];
    for (const s of scans) {
      const line: string[] = [];
      for (const f of s.findings) {
        const fp = fingerprint(f);
        const exact = seen.filter((h) => h.fp === fp);
        const sameClass = seen.filter((h) => h.cwe === f.cwe && h.fp !== fp);
        let label = "new";
        if (exact.length) label = exact.at(-1)!.fixed ? "REGRESSION" : "persistent";
        else if (sameClass.length) label = `same class as ${sameClass.map((h) => `R${h.round}`).join("+")}`;
        if (label !== "new") line.push(`${f.key} ${f.cwe} → ${label}`);
      }
      console.log(`  round ${s.round}: ${s.findings.length} findings${line.length ? `\n    ${line.join("\n    ")}` : ""}`);
      for (const f of s.findings) {
        seen.push({ key: f.key, round: s.round, fp: fingerprint(f), cwe: f.cwe, fixed: fixedKeys.has(f.key) });
      }
    }
  }
  console.log(problems ? `\n${problems} problem(s) found` : "\nDataset OK");
  if (problems) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
