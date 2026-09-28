import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const severityEnum = pgEnum("severity", ["critical", "high", "medium", "low"]);
export const verdictEnum = pgEnum("verdict", ["new", "recurring", "regression", "persistent"]);
export const findingStatusEnum = pgEnum("finding_status", ["open", "fixed"]);
export const scanStageEnum = pgEnum("scan_stage", [
  "saved",
  "recalling",
  "reflecting",
  "retaining",
  "done",
  "failed",
]);
export const memoryOpEnum = pgEnum("memory_op", [
  "bank",
  "retain",
  "recall",
  "reflect",
  "mental_model",
  "consolidate",
]);

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  industry: text("industry").notNull(),
  prefix: text("prefix").notNull(),
  bankId: text("bank_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const repos = pgTable("repos", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull().unique(),
  stack: text("stack").notNull(),
});

export const scans = pgTable(
  "scans",
  {
    id: serial("id").primaryKey(),
    repoId: integer("repo_id")
      .notNull()
      .references(() => repos.id, { onDelete: "cascade" }),
    round: integer("round").notNull(),
    scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull(),
    tool: text("tool").notNull(),
    stage: scanStageEnum("stage").notNull().default("saved"),
    /** Scan-level summary written by Hindsight reflect. */
    brief: text("brief"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("scans_repo_round_idx").on(t.repoId, t.round)],
);

/** A past finding this finding is linked to (the "prior offense" chips in the UI). */
export type PriorFinding = {
  findingId: number;
  key: string;
  round: number;
  scannedAt: string;
  file: string;
  endpoint: string | null;
  status: "open" | "fixed";
  fixedAt: string | null;
  fixNote: string | null;
};

/** A memory Hindsight returned when recalling this finding's history. */
export type MemoryEvidence = {
  id: string;
  text: string;
  type: string | null;
  kind: string | null;
  round: number | null;
  findingId: number | null;
  occurredAt: string | null;
};

export const findings = pgTable(
  "findings",
  {
    id: serial("id").primaryKey(),
    scanId: integer("scan_id")
      .notNull()
      .references(() => scans.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    ruleId: text("rule_id").notNull(),
    cwe: text("cwe").notNull(),
    cweName: text("cwe_name").notNull(),
    severity: severityEnum("severity").notNull(),
    title: text("title").notNull(),
    file: text("file").notNull(),
    line: integer("line").notNull(),
    endpoint: text("endpoint"),
    sink: text("sink"),
    description: text("description").notNull(),
    /** sha1(cwe | file | endpoint): exact "same issue" match across scans. */
    fingerprint: text("fingerprint").notNull(),

    status: findingStatusEnum("status").notNull().default("open"),
    fixedAt: timestamp("fixed_at", { withTimezone: true }),
    fixNote: text("fix_note"),

    verdict: verdictEnum("verdict"),
    /** Where the verdict came from: memory (Hindsight reflect), exact-match (fingerprint), fallback (Hindsight unavailable). */
    verdictSource: text("verdict_source"),
    occurrence: integer("occurrence").notNull().default(1),
    priorFindings: jsonb("prior_findings").$type<PriorFinding[]>().notNull().default([]),
    rootCause: text("root_cause"),
    durableFix: text("durable_fix"),
    memoryEvidence: jsonb("memory_evidence").$type<MemoryEvidence[]>().notNull().default([]),
  },
  (t) => [
    index("findings_scan_idx").on(t.scanId),
    index("findings_fingerprint_idx").on(t.fingerprint),
    index("findings_cwe_idx").on(t.cwe),
  ],
);

/** Every Hindsight call, for the Memory Trace drawer. */
export const memoryCalls = pgTable(
  "memory_calls",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").references(() => clients.id, { onDelete: "cascade" }),
    scanId: integer("scan_id").references(() => scans.id, { onDelete: "cascade" }),
    findingId: integer("finding_id").references(() => findings.id, { onDelete: "set null" }),
    op: memoryOpEnum("op").notNull(),
    bankId: text("bank_id").notNull(),
    label: text("label").notNull(),
    request: jsonb("request").notNull(),
    response: jsonb("response"),
    error: text("error"),
    latencyMs: integer("latency_ms").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("memory_calls_scan_idx").on(t.scanId), index("memory_calls_client_idx").on(t.clientId)],
);

export type Client = typeof clients.$inferSelect;
export type Repo = typeof repos.$inferSelect;
export type Scan = typeof scans.$inferSelect;
export type Finding = typeof findings.$inferSelect;
export type NewFinding = typeof findings.$inferInsert;
export type MemoryCall = typeof memoryCalls.$inferSelect;
export type Verdict = (typeof verdictEnum.enumValues)[number];
export type Severity = (typeof severityEnum.enumValues)[number];
export type ScanStage = (typeof scanStageEnum.enumValues)[number];
export type MemoryOp = (typeof memoryOpEnum.enumValues)[number];
