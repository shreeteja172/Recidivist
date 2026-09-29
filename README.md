# Recidivist

> **The pentest agent that remembers who reoffends.**
> Built for the AI Agents with Persistent Memory Hackathon using [Hindsight](https://hindsight.vectorize.io/) (by Vectorize) as the core memory layer.

---

## 1. What Recidivist Does

Security teams and penetration testers audit the same codebases quarter after quarter. Every traditional scanner treats every audit as a **blank slate**. Because scanners only perform exact file/line matching, they miss the bigger picture:

| Without Memory (What every scanner shows) | With Recidivist (Powered by Hindsight) |
|---|---|
| `HIGH` SQL Injection in `src/app/api/appointments/filter/route.ts` | 🟠 **RECURRING · 3rd offense.** Same root cause as Dec 2025 and Jun 2026: user input reaches the shared `buildQuery()` helper. Each time the team fixed only that one endpoint. **Durable fix:** patch `buildQuery()` itself. |
| `HIGH` Hardcoded Secret in `src/lib/payments/stripe.ts` | 🔴 **REGRESSION.** Marked as fixed on 2026-02-03 (moved to env var), but re-introduced in the same file. |

Recidivist remembers **root causes, fixes, and developer remediation habits**, not just raw file paths.

---

## 2. Where to Spot Hindsight in the Code (Judge Reference)

All Hindsight operations are centralized in `packages/memory` and traced to PostgreSQL for full observability in the UI:

| Hindsight Feature | Code Location | What It Does |
|---|---|---|
| **Memory Banks & Personas** | [`packages/memory/src/bank.ts`](packages/memory/src/bank.ts) | `setupBank()` creates an isolated bank (`client-<slug>`) with custom auditor missions (`reflectMission`, `retainMission`), directives (*"Cite history"*, *"Fix skepticism"*), and skeptical disposition settings. |
| **`retain` (Findings & Fixes)** | [`packages/memory/src/operations.ts`](packages/memory/src/operations.ts) | `retainFindings()` and `retainFixes()` store findings as semantic narratives with timestamps, CWE tags, code entities, and remediation notes. |
| **`recall` (Historical Retrieval)** | [`packages/memory/src/operations.ts`](packages/memory/src/operations.ts) | `recallHistory()` queries past findings, fixes, and observation facts for each vulnerability prior to storing the new scan. |
| **`reflect` (Reasoning Engine)** | [`packages/memory/src/operations.ts`](packages/memory/src/operations.ts) | `reflectOnScan()` prompts Hindsight's reasoning engine with structured JSON output to identify regressions, repeat root causes, and durable fixes. |
| **Mental Models (Security Profile)** | [`packages/memory/src/operations.ts`](packages/memory/src/operations.ts) | `ensureProfile()` and `getProfile()` generate an auto-updating security dossier describing client-specific remediation patterns. |
| **Memory Trace Drawer** | [`packages/memory/src/trace.ts`](packages/memory/src/trace.ts) & [`apps/web/components/MemoryTraceDrawer.tsx`](apps/web/components/MemoryTraceDrawer.tsx) | Every Hindsight call is wrapped with `traced()` and rendered in the live UI with request/response payloads, latency, and status. |

> 📖 **Full Hindsight Documentation**: See [HINDSIGHT.md](HINDSIGHT.md) for a comprehensive explanation of how Hindsight memory is used, what gets retained, what triggers recall, and how regression detection works (ready to copy into hackathon submission forms).

---

## 3. Architecture & Monorepo Layout

```
.
├── apps/
│   ├── web/               # Next.js 16 App Router UI (port :3100)
│   │   ├── app/           # Clients list (/), Client dossier (/clients/[slug]), Scan upload (/upload), Results (/scans/[id])
│   │   └── components/    # TrendChart, MemoryTraceDrawer, MarkFixedModal, Navbar
│   └── api/               # Hono backend API on Node (port :4000)
│       └── src/           # REST endpoints + scan pipeline execution
├── packages/
│   ├── memory/            # The ONLY package calling Hindsight (@vectorize-io/hindsight-client)
│   ├── core/              # Ingest validation, pipeline orchestration, verdict rules, read queries
│   └── db/                # PostgreSQL schema & Drizzle ORM client
└── data/                  # Realistic synthetic dataset (3 clients × 4 quarterly rounds + fixes)
```

---

## 4. Getting Started & Setup

### Prerequisites
- Node.js 22+
- `pnpm` (`v12+`)
- Docker Desktop

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in `HINDSIGHT_LLM_API_KEY` with your OpenAI, Gemini, or Groq API key:
```env
HINDSIGHT_LLM_PROVIDER=openai
HINDSIGHT_LLM_MODEL=gpt-4o-mini
HINDSIGHT_LLM_API_KEY=sk-proj-your-key-here
```
*(Alternatively, point `HINDSIGHT_BASE_URL` to Hindsight Cloud and set `HINDSIGHT_API_KEY`)*

### 3. Start Database & Hindsight Container
```bash
pnpm infra:up
```
*(PostgreSQL starts on port `5433`, Hindsight API on `8888`, and Hindsight Web UI on `9999`)*

### 4. Push Database Schema & Seed Memories
```bash
# Push tables to Postgres
pnpm db:push

# Seed past audit rounds 1–3 and fix histories into Hindsight
pnpm seed
```

### 5. Start Development Servers
```bash
pnpm dev
```
- **Web Application**: [http://localhost:3100](http://localhost:3100)
- **Hono API**: [http://localhost:4000](http://localhost:4000)
- **Hindsight Web UI**: [http://localhost:9999](http://localhost:9999)

---

## 5. Hackathon 75-Second Demo Script

1. **Dashboard (`http://localhost:3100`)**:
   - Showcase the 3 client personas: Northwind Health ("The repeat offender"), Ledgerly ("The good student"), and Brightpath Learning ("Whack-a-mole").
   - Highlight that each client runs in an isolated Hindsight memory bank (`client-<slug>`).
2. **Client Dossier (`/clients/northwind-health`)**:
   - Inspect the **Vulnerability Trajectory Chart** across Rounds 1–3.
   - Read the **Hindsight Security Profile (Mental Model)**: note how Hindsight synthesized that Northwind's endpoint-level fixes fail while middleware-level fixes hold.
3. **1-Click Scan Ingestion (`/clients/northwind-health/upload`)**:
   - Click **"Round 4 (Live Demo Scan · Sep 2026)"** → Click **"Analyze Scan with Recidivist Memory"**.
   - Watch the **Live Analyzing Checklist** as Recidivist saves findings, recalls facts, runs reflection, and updates memory.
4. **The "Memory ON / OFF" Reveal (`/scans/[id]`)**:
   - **Toggle Memory OFF**: Show what standard scanners output — `HIGH SQL Injection` in `/api/appointments/filter`. It looks like an isolated, brand new issue.
   - **Toggle Memory ON**: Flip the switch! The card updates to 🟠 **RECURRING · 3rd offense**. It links back to the shared `buildQuery()` helper and recommends the durable fix.
   - Point out the 🔴 **REGRESSION** on the hardcoded Stripe key.
5. **Memory Trace Drawer**:
   - Click **"Scan Memory Trace"** in the top right to inspect the exact `recall`, `reflect`, and `retain` payloads, latency timings, and JSON receipts.

---

## 6. Useful Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start both the API (:4000) and Web App (:3100) |
| `pnpm typecheck` | Run TypeScript checks across all 5 workspace packages |
| `pnpm --filter @recidivist/core test` | Run verdict logic unit tests |
| `pnpm --filter @recidivist/api check-data` | Validate synthetic datasets and simulate matches |
| `pnpm seed:reset` | Wipe database and memory banks, then re-seed rounds 1–3 |
| `pnpm infra:up` / `pnpm infra:down` | Start or stop PostgreSQL and Hindsight containers |
| `pnpm infra:logs` | Tail Hindsight container logs |
| `pnpm db:studio` | Open Drizzle Studio to inspect PostgreSQL tables |

---

## 7. License

MIT
