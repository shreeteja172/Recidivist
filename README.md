# Recidivist

**The pentest agent that remembers who reoffends.** Recidivist keeps a [Hindsight](https://hindsight.vectorize.io/) memory bank per client. When a new security scan arrives, it recalls that client's past findings and fixes, then tells you which findings are new, which keep recurring (even in a different file), which came back after a fix, and which were never fixed.

See [build.md](build.md) for the full plan, app flow and demo script.

## Layout

```
apps/api         Hono backend on :4000 (routes + scan pipeline)
apps/web         Next.js frontend on :3100
packages/db      Drizzle schema + Postgres client
packages/memory  every Hindsight call (retain / recall / reflect / mental model)
packages/core    scan schema, pipeline, verdict rules, read queries
data/            synthetic dataset: 3 clients × 4 scan rounds + fixes
```

## Setup

Needs Node 22+, pnpm, and Docker.

1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Create `.env` from the template and set `HINDSIGHT_LLM_API_KEY` (and the provider/model if you are not using OpenAI):
   ```bash
   cp .env.example .env
   ```
   For a deployed web app, set `NEXT_PUBLIC_API_URL` in the hosting provider to the public URL of the deployed API.
3. Start Postgres and Hindsight (Hindsight UI: http://localhost:9999). Hindsight exits on startup if `HINDSIGHT_LLM_API_KEY` is empty; `pnpm infra:logs` shows why.
   ```bash
   pnpm infra:up
   ```
4. Create the tables:
   ```bash
   pnpm db:push
   ```
5. Seed memory with scan rounds 1–3 for all clients (takes a few minutes; it calls the LLM):
   ```bash
   pnpm seed
   ```
6. Start the API (and the web app):
   ```bash
   pnpm dev
   ```
7. Upload the live-demo scan and watch the verdicts:
   ```bash
   pnpm upload northwind-health 4
   ```

## Useful commands

| Command                                    | What it does                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `pnpm seed --reset`                        | Wipe Postgres + Hindsight banks and seed again                            |
| `pnpm upload <client> 4 --replace`         | Delete round 4 (and its memories) and upload it again, for demo rehearsal |
| `pnpm --filter @recidivist/api check-data` | Validate `data/` and preview exact-match verdicts                         |
| `pnpm --filter @recidivist/core test`      | Unit tests for the verdict rules                                          |
| `pnpm typecheck`                           | Type-check every package                                                  |
| `pnpm db:studio`                           | Browse the Postgres tables                                                |
