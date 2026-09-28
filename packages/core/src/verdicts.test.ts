import assert from "node:assert/strict";
import { test } from "node:test";
import { decideVerdict, type HistoryRow } from "./verdicts";

const row = (over: Partial<HistoryRow>): HistoryRow => ({
  findingId: 1,
  key: "NW-R1-01",
  round: 1,
  scannedAt: new Date("2025-12-08T09:30:00Z"),
  cwe: "CWE-89",
  file: "src/app/api/patients/search/route.ts",
  endpoint: "GET /api/patients/search",
  fingerprint: "fp-sqli-patients",
  status: "fixed",
  fixedAt: new Date("2026-01-20T00:00:00Z"),
  fixNote: "allow-listed sortBy in handler",
  ...over,
});

const sqliR1 = row({});
const sqliR3 = row({ findingId: 7, key: "NW-R3-01", round: 3, fingerprint: "fp-sqli-reports", file: "src/app/api/reports/export/route.ts", endpoint: "GET /api/reports/export" });
const keyR1 = row({ findingId: 2, key: "NW-R1-02", cwe: "CWE-798", fingerprint: "fp-stripe", file: "src/lib/payments/stripe.ts", endpoint: null });
const cspR3 = row({ findingId: 9, key: "NW-R3-04", round: 3, cwe: "CWE-693", fingerprint: "fp-csp", status: "open", fixedAt: null, fixNote: null });
const history = [sqliR1, sqliR3, keyR1, cspR3];

test("same fingerprint that was fixed is a regression, decided without memory", () => {
  const d = decideVerdict({ id: 20, cwe: "CWE-798", fingerprint: "fp-stripe" }, history, [], undefined, false);
  assert.equal(d.verdict, "regression");
  assert.equal(d.verdictSource, "exact-match");
  assert.deepEqual(d.priorFindings.map((p) => p.key), ["NW-R1-02"]);
  assert.equal(d.occurrence, 2);
});

test("same fingerprint still open is persistent", () => {
  const d = decideVerdict({ id: 21, cwe: "CWE-693", fingerprint: "fp-csp" }, history, [], undefined, true);
  assert.equal(d.verdict, "persistent");
});

test("memory links the same root cause in a new file, with receipts", () => {
  const d = decideVerdict(
    { id: 22, cwe: "CWE-89", fingerprint: "fp-sqli-appointments" },
    history,
    [],
    { findingId: 22, verdict: "recurring", priorRounds: [1, 3], rootCause: "buildQuery() concatenates identifiers", durableFix: "patch buildQuery()" },
    true,
  );
  assert.equal(d.verdict, "recurring");
  assert.equal(d.verdictSource, "memory");
  assert.equal(d.occurrence, 3);
  assert.deepEqual(d.priorFindings.map((p) => p.round), [1, 3]);
  assert.equal(d.durableFix, "patch buildQuery()");
});

test("memory claim with no earlier finding to back it becomes new", () => {
  const d = decideVerdict(
    { id: 23, cwe: "CWE-1333", fingerprint: "fp-redos" },
    history,
    [],
    { findingId: 23, verdict: "recurring", priorRounds: [2], rootCause: null, durableFix: null },
    true,
  );
  assert.equal(d.verdict, "new");
  assert.equal(d.priorFindings.length, 0);
});

test("memory 'regression' in a different file is shown as recurring", () => {
  const d = decideVerdict(
    { id: 25, cwe: "CWE-89", fingerprint: "fp-sqli-invoices" },
    history,
    [],
    { findingId: 25, verdict: "regression", priorRounds: [1], rootCause: null, durableFix: null },
    true,
  );
  assert.equal(d.verdict, "recurring");
  assert.deepEqual(d.priorFindings.map((p) => p.round), [1]);
});

test("without reflect, same CWE falls back to recurring", () => {
  const d = decideVerdict({ id: 24, cwe: "CWE-89", fingerprint: "fp-sqli-new" }, history, [], undefined, false);
  assert.equal(d.verdict, "recurring");
  assert.equal(d.verdictSource, "fallback");
});
