# Recidivist — Build Plan

> **The pentest agent that remembers who reoffends.**
> Hackathon project: AI agents with persistent memory, using [Hindsight](https://hindsight.vectorize.io/) (by Vectorize) as the memory layer.

---

## 1. What we are building

Security teams and freelance pentesters audit the same clients again and again. Their tools treat every scan as a blank slate, so nobody notices when a team "fixes" a bug and it comes back months later somewhere else.

**Recidivist** is a web app where you upload a security scan for a client. Before showing the results, it asks its memory (Hindsight) about that client's history. Every finding then comes back enriched:

| Without memory (what every scanner shows) | With Recidivist |
|---|---|
| `HIGH` SQL Injection in `src/api/appointments/filter.ts` | 🟠 **RECURRING · 3rd offense.** Same root cause as Dec 2025 and Jun 2026: user input reaches the shared `buildQuery()` helper. Each time the team fixed only that one endpoint. **Durable fix:** patch `buildQuery()` itself. |

### The core idea (what makes this more than a database JOIN)

Existing tools (DefectDojo, Faraday, etc.) already detect **exact** repeats: same rule, same file. They miss the **same root cause appearing in a different file or endpoint**, because it looks like a brand-new finding.

Recidivist remembers **root causes and how things were fixed**, not just file names. That lets it say:
- "This is the 3rd time this vulnerability class came from the same shared helper."
- "You fixed this in February, and it is back." (regression)
- "This team fixes at the endpoint level, and those fixes don't hold. Fixes at the middleware level do."

### Scope

**In scope (one tight workflow):** scan upload → memory-aware findings → mark fixed → trend view.

- 3 pre-seeded clients with 3 past scan rounds each
- Upload a scan JSON → live analysis → memory-aware results
- "Mark fixed" on findings (fix notes are remembered)
- Client page with trend chart + auto-updating "Security profile"
- Memory Trace drawer showing every Hindsight call

**Out of scope:** running real scanners, login/multi-user, PDF reports, GitHub integration.

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| App | Next.js (App Router) + TypeScript, pnpm |
| UI | Tailwind + shadcn/ui, Recharts for the trend chart |
| Database | PostgreSQL + Drizzle ORM |
| Validation | zod (scan JSON input) |
| Memory | Hindsight via `@vectorize-io/hindsight-client` (v0.10.x) |
| Hindsight runtime | Docker locally (API `:8888`, web UI `:9999`), or Hindsight Cloud if the hackathon gives credits |

No separate LLM SDK is needed. Hindsight's `reflect` does the reasoning, which keeps memory at the center of the app.

---

## 3. App flow

```
 Clients list ──► Client page ──► Upload scan ──► Analyzing (live) ──► Scan results
                      ▲                                                     │
                      │                                            "Mark fixed" on a finding
                      │                                                     │
                      └──────── next scan months later (memory is bigger) ◄─┘
```

The app runs two loops, **scan** and **fix**. Every pass through either loop adds to memory, so the next scan is smarter.

### Screens

| # | Screen | What the user sees | Behind the scenes |
|---|---|---|---|
| 1 | **Clients list** (`/`) | 3 client cards: open findings, # regressions, trend arrow (↑ worse / ↓ improving) | Postgres only |
| 2 | **Client page** (`/clients/[slug]`) | Trend chart (open / fixed / regressed per round), **Security profile** text box, past scans list, **Upload scan** button | Chart from Postgres. Profile from Hindsight `getMentalModel()` |
| 3 | **Upload scan** (`/clients/[slug]/upload`) | Drag in scan JSON, pick repo, click **Analyze** | Validate with zod, save scan + findings to Postgres |
| 4 | **Analyzing** (`/scans/[id]` while running) | Live checklist + Memory Trace drawer open | `recall` ×N → `reflect` ×1 → `retain` ×N |
| 5 | **Scan results** (`/scans/[id]`) | Finding cards sorted by importance, **Memory ON/OFF** toggle, Memory Trace drawer | Reads saved reflect results + `memory_calls` log |
| 6 | **Mark fixed** (modal on a finding) | "How was it fixed?" text box → status ✅ Fixed | Postgres update + Hindsight `retain` of the fix note |

### Analyzing screen (the live moment)

```
✓ Saved 9 findings
⟳ Recalling history…            (9 recall calls, one per finding)
⟳ Reasoning over history…       (1 reflect call)
⟳ Remembering this scan…        (9 retain calls)
✓ Security profile updated
```

### Scan results: finding verdicts

Cards are sorted in this order:

| Verdict | Badge | Meaning |
|---|---|---|
| `regression` | 🔴 REGRESSION | Was marked fixed; the same issue is back |
| `recurring` | 🟠 RECURRING · Nth offense | Same vulnerability class / root cause seen before, in a different place |
| `persistent` | 🟡 STILL OPEN since &lt;date&gt; | Found before, never fixed |
| `new` | ⚪ NEW | No history |

Each card shows: severity, title, file/endpoint, **prior-occurrence chips** (clickable links to the old findings), root cause, durable fix.

**Memory ON/OFF toggle:** OFF shows only the raw scanner fields (title, severity, file), which is exactly what any scanner shows. ON shows the enriched card. It makes no extra API calls; it only hides or shows the memory data. This is the before/after moment for judges.

### Life of one bug across scans

```
Dec 2025:  SQLi in /api/patients/search      → NEW             → marked fixed ("allow-listed sortBy in handler")
Mar 2026:  (not found)                       → looks fixed ✓
Jun 2026:  SQLi in /api/reports/export       → RECURRING (2nd) → "same buildQuery() helper as Dec"
Sep 2026:  SQLi in /api/appointments/filter  → RECURRING (3rd) → "fix the helper, not the endpoints"
```

A normal scanner calls all three "new" because the file is different each time.

---

## 4. Architecture

```
Next.js (App Router)
 ├─ /                          clients list
 ├─ /clients/[slug]            trend chart (Postgres) + security profile (Hindsight mental model)
 ├─ /scans/[id]                findings with memory context + Memory Trace drawer
 ├─ POST /api/scans            ingest → kicks off pipeline
 ├─ GET  /api/scans/[id]       status + findings + memory_calls (UI polls every 1s)
 └─ POST /api/findings/[id]/fix  mark fixed → retain fix note
        │                                    │
   PostgreSQL (Drizzle)                 lib/memory.ts  ← the ONLY file that calls Hindsight
   clients, repos, scans,                 retainFinding · retainFix · recallHistory
   findings, memory_calls                 reflectOnScan · getClientProfile
                                                 │
                                    Hindsight (Docker :8888 API / :9999 UI, or Cloud)
                                    one memory bank per client: client-<slug>
```

### Who owns what

- **Postgres holds the numbers:** findings, fix status, counts for charts. It is the source of truth.
- **Hindsight holds the history and reasoning:** matching by meaning, patterns learned over time, verdicts, and the client profile.
- **Rule: numbers come from Postgres, words come from Hindsight.** The LLM never produces chart numbers.

### One memory bank per client

Bank id: `client-northwind-health`, `client-ledgerly`, `client-brightpath`.
This guarantees one client's findings never leak into another client's report. That's a real confidentiality requirement for pentesters and worth saying in the pitch.

### Scan pipeline (`lib/pipeline.ts`)

```
1. Validate JSON (zod) → insert scan + findings into Postgres (status = analyzing)
2. RECALL   one call per finding, in parallel        → store recall results per finding
3. REFLECT  one call for the whole scan              → verdict per finding + scan brief
4. Save verdicts to findings table (status = done)
5. RETAIN   one call per finding (tag with repo)
6. Security profile (mental model) refreshes itself after consolidation
```

⚠️ **Recall must happen BEFORE retain.** Otherwise every finding just finds itself in memory.

Run the pipeline in the background (Next.js `after()` or fire-and-forget in the Node runtime). The UI polls `GET /api/scans/[id]`. Run locally with `next start` for the demo, not on serverless.

---

## 5. Folder structure

```
.
├─ app/
│  ├─ page.tsx                          # 1. Clients list
│  ├─ clients/[slug]/page.tsx           # 2. Client page
│  ├─ clients/[slug]/upload/page.tsx    # 3. Upload scan
│  ├─ scans/[id]/page.tsx               # 4+5. Analyzing + results
│  └─ api/
│     ├─ scans/route.ts                 # POST ingest
│     ├─ scans/[id]/route.ts            # GET status/results
│     └─ findings/[id]/fix/route.ts     # POST mark fixed
├─ components/
│  ├─ finding-card.tsx
│  ├─ memory-trace-drawer.tsx
│  ├─ memory-toggle.tsx
│  ├─ trend-chart.tsx
│  └─ security-profile.tsx
├─ lib/
│  ├─ hindsight.ts                      # client + logging wrapper → memory_calls
│  ├─ memory.ts                         # retain / recall / reflect / mental model
│  ├─ pipeline.ts                       # scan pipeline (section 4)
│  ├─ scan-schema.ts                    # zod schema for scan JSON
│  └─ db/{schema.ts,index.ts}
├─ data/
│  ├─ northwind-health/{round-1..4.json, fixes.json}
│  ├─ ledgerly/{round-1..4.json, fixes.json}
│  └─ brightpath/{round-1..4.json, fixes.json}
├─ scripts/
│  ├─ setup-banks.ts                    # create banks, config, directives, mental models
│  └─ seed.ts                           # replay rounds 1–3 + fixes through the real pipeline
├─ docker-compose.yml                   # postgres + hindsight
└─ .env.example
```

### Environment

```
DATABASE_URL=postgres://recidivist:recidivist@localhost:5432/recidivist
HINDSIGHT_BASE_URL=http://localhost:8888
HINDSIGHT_API_KEY=                     # only needed for Hindsight Cloud
```

The Hindsight container needs `HINDSIGHT_API_LLM_PROVIDER`, `HINDSIGHT_API_LLM_API_KEY` and `HINDSIGHT_API_LLM_MODEL` (OpenAI, Anthropic, Groq, Gemini, etc.), with volume `hindsight-data:/home/hindsight/.pg0`.

---

## 6. Database schema (Postgres)

```
clients       id, slug, name, industry, bank_id
repos         id, client_id, name (e.g. northwind/patient-portal), stack
scans         id, repo_id, round, scanned_at, tool, status (analyzing|done|failed), brief
findings      id, scan_id, key, cwe, cwe_name, severity, title, file, line, endpoint, sink,
              description, fingerprint,                       -- sha1(cwe + file + endpoint)
              status (open|fixed), fixed_at, fix_note,
              verdict (new|recurring|regression|persistent),
              prior_rounds int[], root_cause, durable_fix
memory_calls  id, scan_id, finding_id, op (retain|recall|reflect|mental_model),
              bank_id, request jsonb, response jsonb, latency_ms, created_at
```

`memory_calls` powers the **Memory Trace drawer**. Every Hindsight call is logged by the wrapper in `lib/hindsight.ts`, which is how memory stays visible in the UI.

---

## 7. Hindsight integration (`lib/memory.ts`)

### Client

```ts
import { HindsightClient } from '@vectorize-io/hindsight-client';

export const hs = new HindsightClient({
  baseUrl: process.env.HINDSIGHT_BASE_URL!,
  apiKey: process.env.HINDSIGHT_API_KEY, // Cloud only
});
```

### Bank setup (once per client, `scripts/setup-banks.ts`)

```ts
await hs.createBank(bank, {
  reflectMission:
    'I am Recidivist, a senior application-security auditor. I judge every new finding against this client’s full history.',
  retainMission:
    'Extract CWE, severity, file, function, endpoint, root cause, what a fix changed AND did not change, status changes, and dates. Ignore scanner boilerplate.',
  observationsMission:
    'Recurring vulnerability classes, shared code that keeps producing findings, fixes that held vs regressed, and remediation habits of this team.',
});

// Disposition in createBank is deprecated, so set it here
await hs.updateBankConfig(bank, {
  dispositionSkepticism: 5, // "doesn't trust a fix until it survives a rescan"
  dispositionLiteralism: 4,
  dispositionEmpathy: 1,
});

await hs.createDirective(bank, 'Cite history',
  'When calling something recurring or a regression, cite the scan round and date of each earlier occurrence.');
await hs.createDirective(bank, 'Fix skepticism',
  'Treat a fix as "held" only after the issue is absent from at least 2 later scans.');
```

### Retain a finding (pipeline step 5)

Write it as a **sentence, not raw JSON**, because Hindsight extracts facts from text.

```ts
await hs.retain(bank,
  `Scan round 3 (2026-06-08) of northwind/patient-portal: HIGH SQL injection (CWE-89) in GET /api/reports/export. ` +
  `The sortBy query parameter reaches a raw ORDER BY through buildQuery() in src/db/queryBuilder.ts.`,
  {
    timestamp: scan.scannedAt,               // backdated so the timeline makes sense
    context: 'Finding from an automated security scan of the client repository',
    documentId: `finding-${f.id}`,           // re-running the seed won't create duplicates
    tags: [`repo:${repo}`],                  // ONLY this tag (see pitfalls)
    metadata: {                              // values must be strings
      kind: 'finding', findingId: String(f.id), round: '3',
      cwe: 'CWE-89', severity: 'high', file: f.file,
    },
    entities: [
      { text: 'CWE-89 SQL Injection', type: 'vuln_class' },
      { text: 'buildQuery()', type: 'function' },
      { text: 'src/db/queryBuilder.ts', type: 'file' },
      { text: 'GET /api/reports/export', type: 'endpoint' },
    ],
  });
```

### Retain a fix (Mark fixed button)

This is what makes regressions and "fixed the wrong layer" detectable.

```ts
await hs.retain(bank,
  `On 2026-01-20 Northwind marked the CWE-89 SQL injection in GET /api/patients/search as FIXED. ` +
  `Remediation: allow-listed sortBy in the patients handler. The shared buildQuery() helper was not changed.`,
  {
    timestamp: fixedAt,
    documentId: `fix-${f.id}`,
    tags: [`repo:${repo}`],
    metadata: { kind: 'fix', findingId: String(f.id), cwe: 'CWE-89' },
  });
```

### Recall history (pipeline step 2, one per finding)

```ts
const past = await hs.recall(bank,
  `Earlier findings or fixes for ${f.cweName} (${f.cwe}), ${f.sink ?? ''} in ${f.file}, or endpoint ${f.endpoint}`,
  {
    tags: [`repo:${repo}`], tagsMatch: 'all_strict',
    types: ['world', 'observation'],
    preferObservations: true,
    includeSourceFacts: true,
    budget: 'mid', maxTokens: 2048,
  });
```

### Reflect on the scan (pipeline step 3, once per scan)

```ts
const res = await hs.reflect(bank,
  `Scan round 4 of ${repo} found these issues:\n${findingsList}\n` +
  `For each: is it NEW, RECURRING (same class/root cause seen before elsewhere), ` +
  `REGRESSION (previously marked fixed), or PERSISTENT (never fixed)? Cite prior rounds.`,
  {
    tags: [`repo:${repo}`], tagsMatch: 'all_strict',
    budget: 'mid',
    includeFacts: true,
    responseSchema: {
      type: 'object',
      properties: {
        findings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              findingId:   { type: 'string' },
              verdict:     { enum: ['new', 'recurring', 'regression', 'persistent'] },
              priorRounds: { type: 'array', items: { type: 'integer' } },
              rootCause:   { type: 'string' },
              durableFix:  { type: 'string' },
            },
            required: ['findingId', 'verdict'],
          },
        },
        brief: { type: 'string' },
      },
      required: ['findings', 'brief'],
    },
  });
// res.structured_output → verdicts; res.based_on → provenance
```

**Every claim needs a receipt:** only show a prior round on a card if it also appears in that finding's recall results (`metadata.round`). This stops the LLM from inventing history, and each round becomes a clickable chip.

### Security profile (mental model, once per client)

A mental model is a saved `reflect` answer that refreshes itself when memory changes. It becomes the per-client trend summary.

```ts
await hs.createMentalModel(bank, 'Client security profile',
  'Which vulnerability classes keep recurring for this client, which fixes held, which regressed, and what root causes or team habits explain it?',
  {
    id: 'security-profile',
    tags: [`repo:${repo}`],
    trigger: { refreshAfterConsolidation: true },
  });

// Client page:
const profile = await hs.getMentalModel(bank, 'security-profile');
// profile.content (markdown), profile.last_refreshed_at, profile.is_stale
```

### Hindsight features used (for the "visible use of Hindsight" score)

| Feature | Where |
|---|---|
| Memory banks + missions + disposition + directives | One bank per client, skeptical auditor persona |
| `retain` with timestamps, entities, tags, documentId | Every finding and every fix |
| `recall` (semantic + keyword + graph + temporal search) | Per finding on a new scan |
| Observations (auto-learned patterns) | "Team fixes endpoints, not the shared helper" |
| `reflect` with structured output | Verdicts per scan |
| Mental models | Auto-updating client security profile |
| Hindsight web UI (`:9999`) | Shown for a few seconds in the demo |

---

## 8. Scan input format

`data/<client>/round-N.json` uses the same format the Upload screen accepts:

```json
{
  "client": "northwind-health",
  "repo": "northwind/patient-portal",
  "round": 4,
  "scannedAt": "2026-09-14T10:00:00Z",
  "tool": "semgrep",
  "findings": [
    {
      "key": "NW-R4-01",
      "ruleId": "javascript.sqli.tainted-order-by",
      "cwe": "CWE-89",
      "cweName": "SQL Injection",
      "severity": "high",
      "title": "User-controlled sortBy reaches raw ORDER BY clause",
      "file": "src/api/appointments/filter.ts",
      "line": 42,
      "endpoint": "GET /api/appointments/filter",
      "sink": "buildQuery() in src/db/queryBuilder.ts",
      "description": "The sortBy query parameter is passed unvalidated to buildQuery(), which concatenates it into an ORDER BY clause."
    }
  ]
}
```

`data/<client>/fixes.json` lists the fixes applied between rounds (the seed script replays them):

```json
[
  {
    "key": "NW-R1-01",
    "fixedAt": "2026-01-20",
    "note": "Allow-listed sortBy in the patients handler. The shared buildQuery() helper was not changed."
  }
]
```

---

## 9. Synthetic dataset

Scan rounds: **R1 Dec 2025 · R2 Mar 2026 · R3 Jun 2026** (seeded) · **R4 Sep 2026** (uploaded live in the demo).
Each round has 6–10 findings: the story findings below plus noise.

### Northwind Health: `northwind/patient-portal` (Next.js + Postgres), "The repeat offender"

| Finding | R1 (Dec) | R2 (Mar) | R3 (Jun) | R4 (Sep, live) |
|---|---|---|---|---|
| **SQLi CWE-89** via shared `buildQuery()` | `/api/patients/search` → fixed Jan 20 *(endpoint allow-list only)* | — | `/api/reports/export` → 🟠 recurring (2nd) → fixed Jul 8 *(endpoint only again)* | `/api/appointments/filter` → 🟠 **recurring (3rd)** |
| **IDOR CWE-639** `/api/records/:id` | found → fixed Feb 10 *(ownership middleware on the router)* | — | — | — ✅ **held** |
| **Hard-coded Stripe key CWE-798** `src/config/payments.ts` | found → fixed Feb 3 *(moved to env var)* | — | — | back in same file → 🔴 **regression** |
| Missing CSP header CWE-693 | found | still open | still open | 🟡 persistent |

**Learned pattern (observation) to show:** "Northwind's middleware-level fixes hold; endpoint-level fixes don't."

### Ledgerly: `ledgerly/payments-api` (Django), "The good student"

| Finding | R1 | R2 | R3 | R4 |
|---|---|---|---|---|
| **SSRF CWE-918** `payments/webhooks/validators.py` `validate_callback_url()` | found → fixed Feb *(resolve host, block private IP ranges)* | — | — | — ✅ held |
| **Login brute force CWE-307** `POST /v1/auth/login` | found → fixed Feb *(django-axes lockout)* | — | — | — ✅ held |
| **Unsafe deserialization CWE-502** `yaml.load` | `reconciliation/importers/bank_feed.py` → fixed Jan *(yaml.safe_load)* | — | — | `reconciliation/importers/statement_parser.py` after a refactor → 🔴 regression |
| Verbose errors CWE-209 (DEBUG=True on staging) | — | found → fixed | — | — |

Trend: improving (about 9 → 6 → 4 → 3 findings).

### Brightpath Learning: `brightpath/lms-core` (Spring Boot + Thymeleaf), "Whack-a-mole"

| Finding | R1 | R2 | R3 | R4 |
|---|---|---|---|---|
| **Stored XSS CWE-79** via `th:utext` (no shared HTML sanitizer) | `templates/course/discussion.html` → fixed | `templates/assignment/feedback.html` → 🟠 recurring → fixed | `templates/profile/bio.html` → 🟠 recurring (3rd) → fixed | `templates/announcements/post.html` → 🟠 recurring (4th) |
| **CSRF disabled CWE-352** `SecurityConfig.java` `csrf().disable()` | found → fixed Feb | — | disabled again "for the mobile app" → 🔴 regression | 🟡 persistent |
| **Mass assignment CWE-915** `UserController.updateProfile()` binds `role` | — | found → fixed Apr *(DTO)* | — | — ✅ held |

### Noise findings (mix into every round)

Missing security headers (CWE-693), verbose error messages (CWE-209), outdated dependency (CWE-1395, e.g. old `lodash` / `jackson-databind`), open redirect (CWE-601), weak password hashing config (CWE-916), ReDoS regex (CWE-1333). Use realistic file paths for each stack. **No placeholder text**, because fake-looking data hurts judging.

---

## 10. Build order (~24h of work)

- [ ] **1. Setup (1h):** Next.js + pnpm + Tailwind/shadcn + Drizzle. `docker-compose.yml` with Postgres + Hindsight. Check that `:8888` and `:9999` respond.
- [ ] **2. Database schema (1h):** tables from section 6, migrations, `lib/db`.
- [ ] **3. Dataset (2–3h):** write `data/*/round-1..4.json` + `fixes.json` following section 9.
- [ ] **4. Memory module (3h):** `lib/hindsight.ts` (client + logging wrapper into `memory_calls`) and `lib/memory.ts` (5 functions from section 7).
- [ ] **5. Bank setup + seed (1–2h):** `scripts/setup-banks.ts`, then `scripts/seed.ts` replays R1 → fixes → R2 → fixes → R3 through the **real pipeline** with backdated timestamps. Open Hindsight UI (`:9999`) and check that the memories and observations are there.
- [ ] **6. Pipeline + API (3h):** `POST /api/scans`, `GET /api/scans/[id]`, `POST /api/findings/[id]/fix`.
- [ ] **7. Scan results page (5h):** analyzing checklist, finding cards (verdict badges, prior-round chips, root cause, durable fix), Memory Trace drawer, Memory ON/OFF toggle.
- [ ] **8. Client page (3h):** Recharts trend (open / fixed / regressed per round) + Security profile box + past scans list. Clients list home page.
- [ ] **9. Polish (2h):** README with architecture diagram, rehearse demo 5+ times, **record a backup video**.

**If short on time, cut in this order:** Brightpath client → automatic mental-model refresh (use a manual "Refresh" button) → Memory ON/OFF toggle → polling (just reload the page).

**Stretch goals (only if everything above is done):**
- "Ask Recidivist" chat box on the client page (calls `reflect` directly)
- "Where will it show up next?" prediction: other endpoints that also use the risky helper
- Retain the agent's own verdicts as "experience" memories
- Real Semgrep / SARIF JSON adapter

---

## 11. Demo script (75 seconds)

| Time | Show | Say |
|---|---|---|
| 0:00 | Title | "Pentesters audit the same clients every quarter. Their tools forget everything. Northwind has 'fixed' SQL injection twice." |
| 0:10 | Northwind client page | "3 past scans. Every finding and every fix lives in a Hindsight memory bank, one per client, so client data never crosses." |
| 0:20 | Upload R4 with **Memory OFF** | "This is what every scanner gives you: SQL injection, high. Looks new." |
| 0:30 | Flip **Memory ON**; trace drawer shows recall ×9 → reflect | "Now Recidivist asks its memory." Card flips: **"3rd offense: same `buildQuery()` root cause, fixed only at the endpoint in Jan and Jul."** |
| 0:45 | Stripe key 🔴 regression + IDOR ✅ held; open one recall in the trace | "It knows what came back, what held, and why. Here's the actual recall call and what memory returned." |
| 0:60 | Security profile (updated itself) | "Northwind patches endpoints, not shared code. Durable fix: patch `buildQuery()`." |
| 0:70 | Close | **"Recidivist: the auditor that remembers who reoffends."** |

---

## 12. Judging criteria → where we score

| Criteria | Weight | How we hit it |
|---|---|---|
| Innovation | 30% | Root-cause memory (same bug in a *different* place), fix-quality memory, skeptical auditor persona |
| Visible use of Hindsight | 25% | Memory Trace drawer, live analyzing checklist, Memory ON/OFF, security profile, Hindsight UI in demo |
| Clean technical implementation | 20% | All Hindsight calls in one file (`lib/memory.ts`), every call logged, clear Postgres/Hindsight split |
| User experience | 15% | Verdict badges, clickable prior-round chips, one clear workflow |
| Real-world impact | 10% | Pentesters/security teams re-audit clients every quarter; per-client isolation matches real confidentiality needs |

---

## 13. Pitfalls to avoid

1. **Recall before retain** for a new scan, or each finding matches itself.
2. **Use only the `repo:` tag.** Hindsight groups learned patterns (observations) by tag combination. Tags like `severity:high` or `scan:3` split them up, and the "keeps coming back" pattern never forms. Put everything else in `metadata`.
3. **Observations and mental-model refreshes run in the background.** Seed rounds 1–3 hours before the demo, not live. Check them in the Hindsight UI.
4. **Numbers from Postgres, words from Hindsight.** Never let the LLM produce chart counts.
5. **`reflect` is slow** (it runs several reasoning steps). Call it once per scan, not once per finding.
6. **`metadata` values must be strings** (`round: '3'`, not `round: 3`).
7. **Disposition in `createBank` is deprecated.** Use `updateBankConfig`.
8. **Only show prior rounds that appear in recall results**, so every claim has a receipt.
9. **README.md is saved as UTF-16.** Re-save it as UTF-8 so it renders correctly.
10. **Check the hackathon rules** for Hindsight Cloud requirements or free credits.

---

## 14. References

- Hindsight docs: https://hindsight.vectorize.io/
- TypeScript client: https://hindsight.vectorize.io/sdks/nodejs
- Hindsight Cloud TS SDK: https://docs.hindsight.vectorize.io/typescript-sdk/
- Retain: https://hindsight.vectorize.io/developer/retain
- Recall: https://hindsight.vectorize.io/developer/retrieval
- Reflect: https://hindsight.vectorize.io/developer/reflect
- Observations: https://hindsight.vectorize.io/developer/observations
- Mental models: https://hindsight.vectorize.io/developer/api/mental-models
- Memory banks: https://hindsight.vectorize.io/developer/api/memory-banks
- Installation: https://hindsight.vectorize.io/developer/installation
- GitHub: https://github.com/vectorize-io/hindsight
