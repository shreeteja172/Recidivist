# Recidivist: Building a Pentest Agent That Remembers Who Reoffends (https://recidivist.vercel.app/)

Every static analysis tool and penetration testing platform on the market treats security audits as an amnesiac blank slate. Run Semgrep, Snyk, or a commercial DAST tool in January, patch the reported vulnerabilities in February, and when the exact same root cause surfaces inside a different controller in June, your tooling reports it as a brand-new, isolated finding.

The industry calls this "vulnerability triage." In practice, it is groundhog day. 

Security engineers spend hours re-evaluating the same insecure design patterns they flagged six months prior, developers patch route handlers instead of shared libraries, and nobody notices when a temporary hotfix gets quietly reverted. Existing triage workflows miss this because they rely on deterministic primary keys—a hash of `(rule_id, file_path, line_number)`. When a developer copies an unsanitized query builder into a new microservice endpoint, the hash changes, the scanner treats it as day zero, and the institutional knowledge of earlier engagements vanishes.

We built [Recidivist](https://recidivist.vercel.app/) to eliminate this amnesia. Recidivist is an audit agent that maintains a persistent memory bank per client repository. When a new scan report arrives, it recalls the client’s historical findings, architectural sinks, and developer remediation notes. Instead of outputting generic vulnerability lists, it determines whether each finding is genuinely new, a regression of a supposedly fixed bug, or the third time a team has reintroduced the same root cause through a shared helper.

Here is how we designed and built the system, why relational databases alone cannot solve this problem, and what we learned engineering with [Vectorize agent memory](https://vectorize.io/what-is-agent-memory).

---

## The Architecture: Splitting Meaning from State

When building security tools that incorporate LLM reasoning, the quickest way to produce an unmaintainable disaster is allowing the model to manage quantitative application state. Language models are unreliable accountants. They hallucinate version numbers, miscount open ticket totals, and struggle to enforce strict temporal precedence across hundreds of scan records.

We established a firm architectural boundary:
- **PostgreSQL is the source of truth for numbers and transactions.** It stores exact scan timestamps, immutable raw findings, user credentials, fix status transitions, and audit logs.
- **Memory is the source of truth for semantic context and history.** It stores conceptual relationships: how a fix was implemented, which shared helpers taint user input, and the behavioral remediation patterns of the development team.

```
┌────────────────────────────────────────────────────────┐
│                   Next.js 16 Web UI                    │
│      (Trend Chart, Memory ON/OFF Toggle, Trace)        │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTP
┌──────────────────────────▼─────────────────────────────┐
│                 Hono API Server                        │
│  ┌─────────────────────────┐ ┌──────────────────────┐  │
│  │   PostgreSQL Engine     │ │   Hindsight Engine   │  │
│  │  (Exact facts & counts) │ │(Semantic graph & AI) │  │
│  └─────────────────────────┘ └──────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

The stack consists of a Next.js 16 frontend (`apps/web`), a lightweight Hono Node.js backend (`apps/api`), PostgreSQL via Drizzle ORM (`packages/db`), and the [Hindsight memory engine](https://github.com/vectorize-io/hindsight) (`packages/memory`).

Every client repository is provisioned its own isolated memory bank (`client-<slug>`). Client data never shares a memory space. If a pentester audits a fintech API in the morning and a healthcare portal in the afternoon, there is zero risk of cross-tenant observation leakage. Within each bank, we configure custom auditor missions and directives instructing the engine to act as a skeptical auditor: never trust a fix until it survives at least two consecutive audit cycles without reappearing.

---

## The Through-Line: How Semantic Recurrence Detection Works

Consider the failure mode of existing vulnerability tracking. In December, an audit flags an SQL injection in `src/app/api/patients/search/route.ts`. The developer applies a fix: they add an allow-list for the `sortBy` query parameter directly inside that search handler. The ticket is closed.

Three months later, a teammate creates `src/app/api/reports/export/route.ts` and imports the same underlying utility: `buildQuery()` in `src/lib/db/queryBuilder.ts`. The scanner sees a different file name, a different AST node, and fires a generic alert: *"High - SQL Injection"*.

A relational database `JOIN` cannot connect these two findings without manual tagging. Text search for "SQL injection" produces hundreds of noisy matches. 

To solve this, we rely on semantic [Hindsight retrieval](https://hindsight.vectorize.io/) paired with a structured analysis pipeline:

```
[New Scan Uploaded]
        │
        ▼
 1. Ingest Findings ──────► Insert raw records into PostgreSQL (Stage: saved)
        │
        ▼
 2. Targeted Recall ──────► For each finding: query memory for matching sinks,
        │                   files, and past fixes BEFORE retaining new records
        ▼
 3. Scan Reflection ──────► Single batch `reflect` call over full scan context
        │                   evaluating root causes and regressions
        ▼
 4. Grounding & Receipts ─► Cross-reference reflect claims against PostgreSQL
        │                   history ("Every claim must have a verified receipt")
        ▼
 5. Batch Retain ─────────► Retain new findings & update client Mental Model
        │
        ▼
[Enriched Findings Rendered with Verdict Badges & Durable Fix Recommendations]
```

### 1. Retaining Findings as Narratives, Not Dumps

One of our earliest realizations was that throwing raw JSON blobs into a vector index yields terrible recall. Embedding models compress JSON syntax poorly; curly braces and repeated schema keys dilute the semantic signal of the actual vulnerability.

We write findings into memory as plain, descriptive English sentences, supplemented with explicit entity markers:

```typescript
// packages/memory/src/operations.ts

export function findingNarrative(f: FindingMemo): string {
  return [
    `Scan round ${f.round} (${day(f.scannedAt)}) of ${f.repo} reported a ${f.severity.toUpperCase()} ${f.cweName} (${f.cwe}) finding: ${f.title}.`,
    `Location: ${f.file} line ${f.line}${f.endpoint ? `, endpoint ${f.endpoint}` : ""}.`,
    f.sink ? `The vulnerable data flow goes through ${f.sink}.` : "",
    f.description,
  ]
    .filter(Boolean)
    .join(" ");
}
```

When storing a finding, we tag entities explicitly (`vulnerability_class`, `file`, `endpoint`, `code_path`) and assign an idempotent `document_id` derived from our database primary key (`finding-${f.findingId}`). This guarantees that re-indexing an audit round updates facts in place rather than creating duplicate memory nodes.

### 2. The Ordering Trap: Recall Before Retain

When implementing persistent memory in ingest pipelines, there is a subtle trap: **if you retain a scan before running recall, every finding will match against itself.**

The engine will dutifully report 100% semantic similarity because it just indexed the exact sentence you are querying. To prevent this, our pipeline strictly enforces ordering:

```typescript
// packages/core/src/pipeline.ts

// Step 1: Query history for each finding across parallel worker threads
await setStage(scanId, "recalling");
const evidence: MemoryEvidence[][] = await mapLimit(memos, 4, (m) =>
  recallHistory(bankId, m, trace).catch((err) => {
    log(`recall failed for ${m.key}: ${err.message}`);
    return [];
  })
);

// Step 2: Reason over the recalled context
await setStage(scanId, "reflecting");
// ... reflectOnScan evaluates regressions and recurring sinks ...

// Step 3: ONLY after verdicts are determined do we index new findings
await setStage(scanId, "retaining");
await retainFindings(bankId, memos, { async: opts.retainAsync ?? true, ...trace });
```

The recall query searches across multiple axes—combining the CWE title, the code sink, the route endpoint, and the file path:

```typescript
// packages/memory/src/operations.ts

export function recallQuery(f: FindingMemo): string {
  const where = [
    f.sink ? `through ${f.sink}` : "",
    `in ${f.file}`,
    f.endpoint ? `or endpoint ${f.endpoint}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `Earlier findings, fixes and regressions involving ${f.cweName} (${f.cwe}) ${where}`;
}
```

Hindsight executes a hybrid search: dense vector retrieval finds conceptual matches, graph traversal links shared entity nodes (such as the helper function name), and temporal filtering ensures older findings are ordered chronologically.

### 3. Deterministic Grounding: Every Claim Needs a Receipt

Language models hallucinate history if given free rein. In an earlier iteration, our reflection prompt would occasionally claim: *"This SQL injection was seen in Round 2,"* even when Round 2 had zero SQL injection findings.

To make Recidivist production-grade, we implemented an unforgiving verification rule in `packages/core/src/verdicts.ts`: **every claim made by the memory engine must be backed by a verified physical row in PostgreSQL.**

```typescript
// packages/core/src/verdicts.ts

export function decideVerdict(
  finding: CurrentFinding,
  history: HistoryRow[],
  evidence: MemoryEvidence[],
  reflected: ReflectVerdict | undefined,
  reflectAvailable: boolean,
): Decision {
  const text = { rootCause: reflected?.rootCause ?? null, durableFix: reflected?.durableFix ?? null };
  const exact = history.filter((h) => h.fingerprint === finding.fingerprint).sort(byRound);
  const sameClass = history.filter((h) => h.cwe === finding.cwe).sort(byRound);

  // 1. Exact fingerprint match in PostgreSQL? Deterministic rule overrides AI.
  if (exact.length > 0) {
    const latest = exact[exact.length - 1]!;
    return finish(latest.status === "fixed" ? "regression" : "persistent", "exact-match", exact, text);
  }

  // 2. Fallback if reflection service is unreachable
  if (!reflectAvailable) {
    return sameClass.length > 0
      ? finish("recurring", "fallback", sameClass, text)
      : finish("new", "fallback", [], text);
  }

  if (!reflected || reflected.verdict === "new") return finish("new", "memory", [], text);

  // 3. Receipt verification: match reflected claims against actual database records
  const claimed = new Set(reflected.priorRounds);
  const recalledRounds = new Set(evidence.map((e) => e.round).filter((r): r is number => r !== null));
  
  let receipts = sameClass.filter((h) => claimed.has(h.round));
  if (receipts.length === 0) receipts = sameClass.filter((h) => recalledRounds.has(h.round));
  if (receipts.length === 0) receipts = sameClass;
  
  // If no physical historical finding supports the claim, demote verdict to "new"
  if (receipts.length === 0) return finish("new", "memory", [], text);

  return finish("recurring", "memory", receipts, text);
}
```

If the exact SHA-1 fingerprint matches a previously resolved finding, it is an indisputable 🔴 **REGRESSION**—we do not even need the LLM to confirm it. 

If the issue appears in a new file, we let Hindsight evaluate whether the root cause matches an earlier incident. But if the LLM cites Round 2 and PostgreSQL shows no corresponding vulnerability occurred in Round 2, the claim is rejected and demoted to `new`. When a claim passes verification, the historical records are attached as clickable receipt chips in the UI.

### 4. Retaining the "Negative Space" of Fixes

When developers fix a bug, standard ticketing tools record something like *"Ticket resolved"*. That conveys zero technical context.

In Recidivist, when an auditor or engineer marks a finding as resolved in the interface, we prompt for what changed and what was *not* changed. We retain this as a distinct remediation event:

```typescript
// packages/memory/src/operations.ts

export function fixNarrative({ finding: f, fixedAt, note }: FixMemo): string {
  return (
    `On ${day(fixedAt)} the team marked the ${f.cweName} (${f.cwe}) finding from scan round ${f.round} ` +
    `in ${f.endpoint ?? f.file} (${f.file}) as FIXED. Remediation: ${note}`
  );
}
```

Retaining the "negative space" is what enables high-value insights. If the fix note says *"Allow-listed sortBy query parameter in search handler. Shared buildQuery helper was not altered,"* Hindsight retains that the core helper remains unsafe. When `buildQuery` appears in a subsequent scan, the engine connects the dots immediately.

---

## Results and Behavior in Production

To evaluate Recidivist, we ran multi-quarter audit histories across three distinct software profiles:
1. **Northwind Health** (`northwind/patient-portal` - Next.js + PostgreSQL): Characterized by quick, superficial route patches.
2. **Ledgerly** (`ledgerly/payments-api` - Django + PostgreSQL): A disciplined engineering culture that patches at the middleware and framework level.
3. **Brightpath Learning** (`brightpath/lms-core` - Spring Boot + Thymeleaf): A sprawling monolithic codebase suffering from template injection whack-a-mole.

Here is what the system surfaced during an audit of Northwind Health:

### The Raw Scanner View (Memory OFF)
With memory enrichment disabled, the interface presents the raw output produced by an automated scanner:
```
HIGH · SQL Injection (CWE-89)
src/app/api/appointments/filter/route.ts:42
User-controlled sortBy parameter concatenated into raw SQL query.
Status: NEW
```
To an auditor seeing this for the first time, this looks like an isolated issue requiring a one-line sanitize check on `/api/appointments/filter`.

### The Recidivist View (Memory ON)
With memory enabled, the exact same scan ingestion renders:
```
🟠 RECURRING · 3rd Offense (Source: memory)
Prior Occurrences: [Round 1 ✓ (Fixed)] [Round 3 ✓ (Fixed)]

Root Cause Correlation:
User input reaches the shared buildQuery() helper in src/lib/db/queryBuilder.ts, 
which concatenates unsanitized sortBy keys into ORDER BY clauses.

Durable Remediation:
Do not patch /api/appointments/filter. Refactor buildQuery() to validate sort 
columns against an allowed column schema map, resolving this issue across all 
endpoints permanently.
```

Directly underneath, a hardcoded Stripe API secret in `src/lib/payments/stripe.ts` was flagged:
```
🔴 REGRESSION (Source: exact-match)
Prior Occurrence: [Round 1 ✓ (Fixed on 2026-02-03)]
Receipt: Fixed in Round 1 by moving key to process.env.STRIPE_SECRET_KEY. 
The literal secret string was re-committed to the same file.
```

### The Auto-Updating Security Profile (Mental Models)
Rather than forcing security leadership to read hundreds of individual finding cards, Recidivist maintains an auto-refreshing Hindsight Mental Model for the repository. Whenever new scans or fixes are consolidated, the model updates its strategic assessment:

> **Northwind Health Security Profile (Synthesized by Hindsight):**
> *"Northwind demonstrates a consistent pattern of patching symptom endpoints while leaving shared vulnerable code paths intact. Over four audit cycles, SQL injection (CWE-89) recurred three times across different route handlers because fixes were applied inside route handlers rather than refactoring `queryBuilder.ts`. Conversely, their IDOR fix in Round 1—implemented via session verification middleware—has held without regression across all subsequent scans. Recommendation: Enforce architectural review on database access layers and restrict raw string concatenation in query utilities."*

This is not a prompt someone typed into a chat box. It is an auto-maintained synthesis derived from months of audit findings, fix events, and observation consolidation.

---

## Lessons Learned

Building an agent with persistent memory revealed several non-obvious engineering realities:

### 1. Tag Hygiene Dictates Memory Quality
Hindsight groups auto-learned observations by tag combinations. Early in the project, we tagged findings with `severity:high`, `round:3`, and `cwe:89`. 
This was a mistake. Splitting memory items across fragmented tag sets prevented the observation engine from clustering related events. The rule we arrived at: **tag only by tenant identity (`repo:${repo}`) and store attributes like severity, round, and rule IDs in metadata.** Once we consolidated tags, cross-scan observations began forming reliably.

### 2. Batch `reflect`, Parallelize `recall`
`recall` is fast (sub-150ms) because it operates over indexed vector embeddings and graph structures. `reflect` is an intensive reasoning step that processes multi-turn context against a structured JSON schema. Do not call `reflect` per finding. Run recall concurrently across your findings using worker pools (`mapLimit`), construct a comprehensive summary of the scan context, and execute `reflect` exactly once per audit.

### 3. Never Let Generative Memory Own Numerical State
If you ask an LLM: *"How many findings were fixed in Round 2?"*, it will eventually miscount. If you ask PostgreSQL: `SELECT COUNT(*) FROM findings WHERE status = 'fixed' AND round = 2`, it will never fail. Use your database for counting, sorting, and state transitions. Use your memory layer for pattern extraction, root-cause correlation, and remediation narrative synthesis.

### 4. Provide Complete Observability or Users Will Not Trust It
Security engineers are trained to be suspicious of automated claims. If an agent asserts that a bug is a "third offense," the immediate reaction is disbelief.
We built a dedicated **Memory Trace Drawer** directly into the interface. Every execution of `recall`, `reflect`, `retain`, and `mental_model` is logged to PostgreSQL with its exact latency, request payload, and raw engine response. When an auditor clicks a prior occurrence badge, they inspect the exact historical receipt. Total transparency is the prerequisite for trust.

---

## Conclusion

The fundamental flaw in modern application security is not that our scanners lack rules; it is that they lack continuity. Software security is an iterative dialogue between development teams and their codebases, but our audit tooling treats every scan like day one.

By pairing deterministic database constraints with the persistent graph and narrative memory of Hindsight, we turned an amnesiac vulnerability scanner into an intelligent auditor that remembers every broken promise, every fragile patch, and every recurring mistake.

The code and schemas are open and available on the [Recidivist repository](https://github.com/shreeteja172/Recidivist).
