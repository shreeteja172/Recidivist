# How Hindsight Memory Is Used in Recidivist

> **Submission Document**: Explanation of how Hindsight memory is used in Recidivist.
> You can copy and paste this document directly into the hackathon submission portal.

---

## Executive Summary

Traditional security scanners treat every audit as a blank slate. They report the exact same root cause as a "brand new finding" just because it surfaced in a different file or endpoint, and they have no memory of whether a fix applied three months ago actually held.

**Recidivist** uses [Hindsight](https://hindsight.vectorize.io/) as a persistent memory layer across audit engagements. By assigning an isolated memory bank to each client codebase, Recidivist retains findings and remediation notes, recalls relevant historical facts prior to indexing new scans, and leverages Hindsight's `reflect` engine to determine whether a vulnerability is:
1. 🔴 **REGRESSION**: An issue that was marked fixed and has now reappeared.
2. 🟠 **RECURRING (Nth offense)**: The same root cause or vulnerable helper seen before in a different location.
3. 🟡 **STILL OPEN / PERSISTENT**: Found in previous audits and never fixed.
4. ⚪ **NEW**: Genuinely new issue with no historical precedent.

---

## 1. What Gets Retained in Memory

Hindsight extracts knowledge graphs and facts from natural language text, not raw JSON blobs. Recidivist retains two core primitives:

### A. Security Findings (at Scan Ingestion)
When a scan is ingested, each finding is converted into a structured narrative:
- **Narrative Content**:
  > *"Scan round 3 (2026-06-08) of northwind/patient-portal reported a HIGH SQL Injection (CWE-89) finding: User-controlled sortBy reaches raw ORDER BY clause. Location: src/app/api/reports/export/route.ts line 28, endpoint GET /api/reports/export. The vulnerable data flow goes through buildQuery() in src/lib/db/queryBuilder.ts."*
- **Timestamps**: Backdated to the actual scan timestamp (`scannedAt`) so Hindsight maintains an accurate temporal timeline.
- **Document IDs**: Idempotent document identifiers (`finding-${id}`) to ensure re-seeding or re-running does not create duplicate memories.
- **Entity Extraction**: Explicitly tagged entities for `{ text: 'CWE-89 SQL Injection', type: 'vulnerability_class' }`, `{ text: 'buildQuery()', type: 'code_path' }`, and `{ text: 'src/lib/db/queryBuilder.ts', type: 'file' }`.
- **Tags & Metadata**: Tagged strictly with `repo:${repo}` (preserving observation clustering) and metadata strings for `cwe`, `severity`, `round`, and `file`.

### B. Remediation Events ("Mark Fixed" Notes)
When an auditor or developer marks a finding as fixed, Recidivist retains the remediation note:
- **Remediation Narrative**:
  > *"On 2026-01-20 the team marked the SQL Injection (CWE-89) finding from scan round 1 in GET /api/patients/search as FIXED. Remediation: Allow-listed sortBy in the patients handler. The shared buildQuery() helper was not changed."*
- **Why this matters**: Retaining *what was changed AND what was not changed* allows Hindsight to learn team remediation habits (e.g. "team patches endpoints instead of shared helpers").

---

## 2. What Triggers Recall

Recall is executed **automatically for every individual finding** during scan ingestion:

1. **Ordering is Critical**: Recall runs **before** the new scan's findings are retained. If a scan was retained first, every finding would simply match itself in memory.
2. **Recall Query Structure**:
   ```ts
   Earlier findings, fixes and regressions involving ${cweName} (${cwe}) through ${sink} in ${file} or endpoint ${endpoint}
   ```
3. **Multi-Modal Retrieval**: Hindsight searches across semantic vector similarity, keyword matching, temporal proximity, and the entity graph.
4. **Observation & Fact Ingestion**: Recidivist retrieves both direct world facts and learned observations with `includeSourceFacts: true`, providing a factual audit trail of past offenses.

---

## 3. How Regression & Recurrence Detection Works

Recidivist pairs deterministic database facts with Hindsight's semantic reasoning in a three-tier decision engine:

```
                  ┌──────────────────────────────────────────────┐
                  │          New Scan Finding Arrives            │
                  └──────────────────────┬───────────────────────┘
                                         │
                         Exact Fingerprint Match?
                         (same CWE, file, endpoint)
                                ┌────────┴────────┐
                                │                 │
                             [ YES ]           [ NO ]
                                │                 │
                     Was it previously fixed?     │
                     ┌──────────┴──────────┐      │
                  [ YES ]               [ NO ]    │
                     │                     │      │
               🔴 REGRESSION         🟡 PERSISTENT │
                                                  ▼
                                       Hindsight `reflect`
                                    (Semantic & Helper Match)
                                         ┌────────┴────────┐
                                         │                 │
                                    [ MATCH ]          [ NO MATCH ]
                                         │                 │
                                    🟠 RECURRING        ⚪ NEW
                                   (Nth Offense)
```

1. **Deterministic Fingerprint Check (PostgreSQL)**:
   - If the exact same issue (`sha1(cwe | file | endpoint)`) was previously marked `fixed`, it is immediately classified as a 🔴 **REGRESSION**.
   - If it was seen before and still `open`, it is 🟡 **PERSISTENT**.
2. **Semantic Reflection (`reflectOnScan`)**:
   - For issues in different files or endpoints, Recidivist submits the scan findings and recalled history to Hindsight's `reflect` API with a strict structured JSON schema.
   - Hindsight determines whether the issue shares a root cause with previous audits (e.g. user input reaching the shared `buildQuery()` utility).
   - If linked to prior rounds, it is classified as 🟠 **RECURRING** with its offense count (`occurrence`), the underlying root cause, and a durable fix recommendation.
3. **"Every Claim Has a Receipt"**:
   - To eliminate LLM hallucinations, Recidivist validates all reflect claims against PostgreSQL history. Only prior rounds that have verified historical finding records are displayed as clickable receipt chips.

---

## 4. Mental Models (Client Security Profile)

Recidivist provisions an auto-updating Hindsight Mental Model (`security-profile`) per client memory bank:

- **Trigger**: Configured with `refreshAfterConsolidation: true`. Whenever background observation consolidation finishes, Hindsight refreshes its synthesis.
- **Auditor Question Answered**:
  > *"Which vulnerability classes keep recurring for this client, which fixes held, which regressed, and what root causes or team habits explain it?"*
- **Result in UI**: Client dossiers display an AI-generated profile summarizing team remediation habits (e.g., *"Northwind's middleware-level fixes hold; endpoint-level fixes do not. The team repeatedly fixes SQL injection at the controller layer while leaving queryBuilder.ts vulnerable"*).

---

## 5. Bank Isolation & Skeptical Persona

- **Client Isolation**: Memory banks are partitioned by client (`client-northwind-health`, `client-ledgerly`, `client-brightpath`). Client findings and fixes never cross tenant boundaries, respecting strict penetration testing confidentiality.
- **Skeptical Disposition**: Banks are configured with `dispositionSkepticism: 5`, `dispositionLiteralism: 4`, and `dispositionEmpathy: 1`.
- **Auditor Directives**:
  - *"Cite history: When calling a finding recurring or a regression, cite the scan round and date of each earlier occurrence."*
  - *"Fix skepticism: Treat a fix as having held only when the issue is absent from at least two later scans."*
  - *"Client confidentiality: Only use this client's own history."*

---

## 6. Complete Memory Trace Observability

Every single interaction with Hindsight (`bank`, `retain`, `recall`, `reflect`, `mental_model`, `consolidate`) passes through a tracing wrapper (`packages/memory/src/trace.ts`) and is logged into PostgreSQL's `memory_calls` table. 

In the web interface, auditors can open the **Memory Trace Drawer** to inspect:
- The exact operation (`RECALL`, `REFLECT`, `RETAIN`, `MENTAL MODEL`)
- Execution latency in milliseconds
- Exact JSON request parameters sent to Hindsight
- Full raw responses and reasoning output from Hindsight
