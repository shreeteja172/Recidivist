/**
 * Upload a sample scan through the API and print the memory-aware results (end-to-end test without the UI).
 *
 *   pnpm upload northwind-health 4            # the live-demo scan
 *   pnpm upload northwind-health 4 --replace  # delete the existing round 4 first (demo rehearsal)
 */
import { readDataJson } from "../data";

const [client, roundArg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const replace = process.argv.includes("--replace");
const api = `http://localhost:${process.env.API_PORT ?? 4000}`;

type ScanDetail = {
  scan: { id: number; stage: string; brief: string | null; error: string | null };
  progress: { findings: number; recalls: number; reflects: number; retains: number };
  findings: Array<{
    key: string;
    severity: string;
    cwe: string;
    file: string;
    verdict: string | null;
    verdictSource: string | null;
    occurrence: number;
    priorFindings: Array<{ round: number }>;
    rootCause: string | null;
    durableFix: string | null;
  }>;
};

async function call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as T };
}

async function main() {
  if (!client || !roundArg) throw new Error("Usage: pnpm upload <client-slug> <round> [--replace]");
  const scan = await readDataJson(`${client}/round-${roundArg}.json`);

  let res = await call<{ scanId?: number; error?: string; details?: { scanId?: number } }>("POST", "/scans", scan);
  if (res.status === 409 && replace && res.data.details?.scanId) {
    console.log(`Deleting existing scan ${res.data.details.scanId} and its memories…`);
    await call("DELETE", `/scans/${res.data.details.scanId}`);
    res = await call("POST", "/scans", scan);
  }
  if (res.status !== 202 || !res.data.scanId) throw new Error(`Upload failed (${res.status}): ${JSON.stringify(res.data)}`);
  const scanId = res.data.scanId;
  console.log(`Uploaded as scan ${scanId}. Analyzing…`);

  const started = Date.now();
  let lastLine = "";
  let detail: ScanDetail;
  for (;;) {
    detail = (await call<ScanDetail>("GET", `/scans/${scanId}`)).data;
    const p = detail.progress;
    const line = `  ${detail.scan.stage.padEnd(10)} recall ${p.recalls}/${p.findings} · reflect ${p.reflects} · retain ${p.retains}`;
    if (line !== lastLine) console.log(`${line}  (${Math.round((Date.now() - started) / 1000)}s)`);
    lastLine = line;
    if (detail.scan.stage === "done" || detail.scan.stage === "failed") break;
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (detail.scan.error) console.log(`\nError: ${detail.scan.error}`);
  console.log(`\nBrief: ${detail.scan.brief}\n`);
  for (const f of detail.findings) {
    const rounds = [...new Set(f.priorFindings.map((p) => p.round))].join(", ");
    console.log(
      `${(f.verdict ?? "?").toUpperCase().padEnd(10)} ${f.key.padEnd(9)} ${f.severity.padEnd(8)} ${f.cwe.padEnd(9)} ${f.file}`,
    );
    if (f.verdict && f.verdict !== "new") {
      console.log(`           offense #${f.occurrence}, earlier rounds: ${rounds || "-"}  [${f.verdictSource}]`);
    }
    if (f.rootCause) console.log(`           root cause: ${f.rootCause}`);
    if (f.durableFix) console.log(`           durable fix: ${f.durableFix}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
