export type Severity = "critical" | "high" | "medium" | "low";

export type Verdict = "new" | "recurring" | "regression" | "persistent";

export type VerdictSource = "memory" | "exact-match" | "fallback";

export type FindingStatus = "open" | "fixed";

export type PriorFinding = {
  findingId: number;
  key: string;
  round: number;
  scannedAt: string;
  file: string;
  endpoint: string | null;
  status: FindingStatus;
  fixedAt: string | null;
  fixNote: string | null;
};

export type MemoryEvidence = {
  fact: string;
  type: string;
  round: number | null;
  scannedAt: string | null;
  file: string | null;
  endpoint: string | null;
  status: string | null;
};

export type Finding = {
  id: number;
  scanId: number;
  key: string;
  ruleId: string;
  cwe: string;
  cweName: string;
  severity: Severity;
  title: string;
  file: string;
  line: number | null;
  endpoint: string | null;
  sink: string | null;
  description: string;
  fingerprint: string;
  status: FindingStatus;
  fixedAt: string | null;
  fixNote: string | null;
  verdict: Verdict | null;
  verdictSource: VerdictSource | null;
  occurrence: number | null;
  priorFindings: PriorFinding[] | null;
  rootCause: string | null;
  durableFix: string | null;
  memoryEvidence: MemoryEvidence[] | null;
};

export type ScanCounts = {
  total: number;
  open: number;
  fixed: number;
  bySeverity: Record<Severity, number>;
  byVerdict: Record<Verdict | "pending", number>;
};

export type ScanSummary = {
  id: number;
  round: number;
  scannedAt: string;
  tool: string;
  stage: "saved" | "recalling" | "reflecting" | "retaining" | "done" | "failed";
  brief: string | null;
  counts: ScanCounts;
};

export type ClientSummary = {
  slug: string;
  name: string;
  industry: string;
  bankId: string;
  repo: { name: string; stack: string };
  scanCount: number;
  latestScan: ScanSummary | null;
  openFindings: number;
  trend: "worse" | "better" | "flat";
};

export type RapSheetItem = {
  cwe: string;
  cweName: string;
  rounds: number[];
  open: number;
  regressions: number;
  occurrences: number;
};

export type MentalModel = {
  id: string;
  name: string;
  content: string;
  lastRefreshedAt: string | null;
  isStale?: boolean;
};

export type ClientDetail = {
  client: { slug: string; name: string; industry: string; bankId: string };
  repo: { name: string; stack: string };
  trend: ScanSummary[];
  rapSheet: RapSheetItem[];
  profile?: MentalModel | null;
};

export type ScanDetail = {
  scan: {
    id: number;
    round: number;
    scannedAt: string;
    tool: string;
    stage: "saved" | "recalling" | "reflecting" | "retaining" | "done" | "failed";
    brief: string | null;
    error: string | null;
    finishedAt: string | null;
  };
  client: { slug: string; name: string; bankId: string };
  repo: { name: string; stack: string };
  progress: {
    findings: number;
    recalls: number;
    reflects: number;
    retains: number;
  };
  counts: ScanCounts;
  findings: Finding[];
};

export type MemoryCall = {
  id: number;
  clientId: number | null;
  scanId: number | null;
  findingId: number | null;
  op: "bank" | "retain" | "recall" | "reflect" | "mental_model" | "consolidate";
  bankId: string;
  label: string;
  request: unknown;
  response: unknown;
  error: string | null;
  latencyMs: number;
  createdAt: string;
};

export type HealthStatus = {
  ok: boolean;
  db: boolean;
  hindsight: { ok: boolean; version?: string; error?: string };
};
