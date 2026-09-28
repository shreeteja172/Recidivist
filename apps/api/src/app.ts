import {
  deleteScan,
  getClientDetail,
  getClientProfile,
  getScanDetail,
  HttpError,
  ingestScan,
  listClients,
  listMemoryCalls,
  MarkFixedSchema,
  markFixed,
  resetScanVerdicts,
  runPipeline,
} from "@recidivist/core";
import { db, sql } from "@recidivist/db";
import { bankIdFor, hindsightVersion, refreshProfile } from "@recidivist/memory";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { readDataJson } from "./data";

/** Scans whose pipeline is running in this process (so a double-click can't start it twice). */
const running = new Set<number>();

function startPipeline(scanId: number) {
  if (running.has(scanId)) return false;
  running.add(scanId);
  runPipeline(scanId, { retainAsync: true, log: (m) => console.log(`[scan ${scanId}] ${m}`) })
    .catch((err) => console.error(`[scan ${scanId}] pipeline failed`, err))
    .finally(() => running.delete(scanId));
  return true;
}

const id = (raw: string) => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `Invalid id: ${raw}`);
  return n;
};

async function jsonBody(c: { req: { json: () => Promise<unknown> } }) {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
}

export const app = new Hono();

app.use("*", logger());
app.use("*", cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3100" }));

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message, details: err.details ?? null }, err.status);
  console.error(err);
  return c.json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
});

app.get("/health", async (c) => {
  const [dbOk, hindsight] = await Promise.all([
    db.execute(sql`select 1`).then(() => true, () => false),
    hindsightVersion().then(
      (v) => ({ ok: true, version: v }),
      (err) => ({ ok: false, error: err instanceof Error ? err.message : String(err) }),
    ),
  ]);
  return c.json({ ok: dbOk && hindsight.ok, db: dbOk, hindsight }, dbOk && hindsight.ok ? 200 : 503);
});

// ---- clients --------------------------------------------------------------

app.get("/clients", async (c) => c.json(await listClients()));

app.get("/clients/:slug", async (c) =>
  c.json(await getClientDetail(c.req.param("slug"), { withProfile: c.req.query("profile") === "1" })),
);

app.get("/clients/:slug/profile", async (c) => c.json(await getClientProfile(c.req.param("slug"))));

app.post("/clients/:slug/profile/refresh", async (c) => {
  const bankId = bankIdFor(c.req.param("slug"));
  return c.json(await refreshProfile(bankId), 202);
});

app.get("/clients/:slug/memory-calls", async (c) =>
  c.json(await listMemoryCalls({ clientSlug: c.req.param("slug"), limit: Number(c.req.query("limit") ?? 200) })),
);

// ---- scans ----------------------------------------------------------------

/** Upload a scan: store it, then run recall → reflect → retain in the background. Poll GET /scans/:id. */
app.post("/scans", async (c) => {
  const { scanId } = await ingestScan(await jsonBody(c));
  startPipeline(scanId);
  return c.json({ scanId }, 202);
});

app.get("/scans/:id", async (c) => c.json(await getScanDetail(id(c.req.param("id")))));

app.get("/scans/:id/memory-calls", async (c) =>
  c.json(await listMemoryCalls({ scanId: id(c.req.param("id")), limit: Number(c.req.query("limit") ?? 200) })),
);

app.post("/scans/:id/rerun", async (c) => {
  const scanId = id(c.req.param("id"));
  if (running.has(scanId)) throw new HttpError(409, "Scan is already being analyzed");
  await resetScanVerdicts(scanId);
  startPipeline(scanId);
  return c.json({ scanId }, 202);
});

app.delete("/scans/:id", async (c) => {
  const scanId = id(c.req.param("id"));
  if (running.has(scanId)) throw new HttpError(409, "Scan is still being analyzed");
  return c.json(await deleteScan(scanId));
});

// ---- findings -------------------------------------------------------------

app.post("/findings/:id/fix", async (c) => {
  const parsed = MarkFixedSchema.safeParse(await jsonBody(c));
  if (!parsed.success) throw new HttpError(400, "Invalid fix", parsed.error.issues);
  const [finding] = await markFixed([
    {
      findingId: id(c.req.param("id")),
      note: parsed.data.note,
      fixedAt: parsed.data.fixedAt ? new Date(parsed.data.fixedAt) : undefined,
    },
  ]);
  return c.json(finding);
});

// ---- memory trace + demo helpers -------------------------------------------

app.get("/memory-calls", async (c) => c.json(await listMemoryCalls({ limit: Number(c.req.query("limit") ?? 100) })));

/** Sample scan files, so the upload screen can offer "use round 4 sample". */
app.get("/samples/:client/:round", async (c) => {
  const client = c.req.param("client");
  const round = id(c.req.param("round"));
  if (!/^[a-z0-9-]+$/.test(client)) throw new HttpError(400, "Invalid client");
  try {
    return c.json(await readDataJson(`${client}/round-${round}.json`));
  } catch {
    throw new HttpError(404, `No sample for ${client} round ${round}`);
  }
});
