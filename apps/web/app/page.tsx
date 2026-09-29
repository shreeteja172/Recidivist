"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchClients } from "../lib/api";
import type { ClientSummary } from "../lib/types";
import {
  ShieldAlert,
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
  Minus,
  Upload,
  Calendar,
  Layers,
  Brain,
  ArrowRight,
  ExternalLink,
  Lock,
} from "lucide-react";

export default function HomePage() {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchClients()
      .then(setClients)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load clients"))
      .finally(() => setLoading(false));
  }, []);

  const personaDescriptions: Record<string, { tag: string; story: string }> = {
    "northwind-health": {
      tag: "The Repeat Offender",
      story: "Patches endpoints instead of shared helpers. SQL injection recurring across 3 rounds; hardcoded Stripe secret regressed.",
    },
    ledgerly: {
      tag: "The Good Student",
      story: "Remediates properly at architectural level. Findings dropping steadily from 9 down to 3.",
    },
    brightpath: {
      tag: "Whack-a-mole",
      story: "Stored XSS recurs in 4 different template files because no central HTML sanitizer exists. CSRF was disabled again.",
    },
  };

  return (
    <div className="space-y-10">
      {/* Hero Section */}
      <div className="relative rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900/60 to-slate-950 border border-slate-800 p-8 sm:p-10 overflow-hidden shadow-2xl">
        <div className="absolute right-0 top-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-80 h-80 bg-red-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono mb-4">
            <Brain className="w-3.5 h-3.5" />
            <span>Persistent Hindsight Memory Layer Active</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white mb-4">
            The pentest agent that <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-amber-400 to-cyan-400">remembers who reoffends</span>.
          </h1>

          <p className="text-base sm:text-lg text-slate-300 leading-relaxed mb-6">
            Standard scanners treat every audit as a blank slate. Recidivist keeps a persistent{" "}
            <span className="text-cyan-400 font-semibold">Hindsight memory bank</span> per client to recall past fixes, recognize when the same root cause returns in a different file, and alert you to regressed vulnerabilities.
          </p>

          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/80 text-xs font-mono text-slate-300">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>Regression Detection</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/80 text-xs font-mono text-slate-300">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>Root Cause Recurrence</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/80 text-xs font-mono text-slate-300">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span>Isolated Client Banks</span>
            </div>
          </div>
        </div>
      </div>

      {/* Clients Section */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Client Repositories & Banks</h2>
            <p className="text-sm text-slate-400">
              Each client runs in an isolated Hindsight memory bank ensuring zero cross-tenant contamination.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-72 rounded-xl bg-slate-900/60 border border-slate-800 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="p-6 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300">
            <p className="font-semibold mb-1">Failed to connect to Recidivist API</p>
            <p className="text-xs font-mono">{error}</p>
            <p className="text-xs text-slate-400 mt-2">
              Ensure the backend is running at <code className="text-slate-300">http://localhost:4000</code>.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {clients.map((c) => {
              const persona = personaDescriptions[c.slug] || {
                tag: "Audit Target",
                story: "Security scan audits tracked with persistent memory.",
              };

              const latestRound = c.latestScan?.round ?? 0;
              const regressions = c.latestScan?.counts?.byVerdict?.regression || 0;
              const recurrings = c.latestScan?.counts?.byVerdict?.recurring || 0;

              return (
                <div
                  key={c.slug}
                  className="rounded-xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition-all hover:shadow-xl flex flex-col justify-between overflow-hidden group"
                >
                  <div className="p-6">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                          {c.industry}
                        </span>
                        <h3 className="text-lg font-bold text-white mt-1 group-hover:text-cyan-300 transition-colors">
                          {c.name}
                        </h3>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {persona.tag}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 mb-4 line-clamp-2 leading-relaxed">
                      {persona.story}
                    </p>

                    {/* Repo & Bank info */}
                    <div className="space-y-1.5 py-3 border-y border-slate-800/80 text-xs font-mono mb-4">
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-slate-500" />
                          Repo:
                        </span>
                        <span className="text-slate-200">{c.repo.name}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-slate-500" />
                          Bank:
                        </span>
                        <span className="text-cyan-400">{c.bankId}</span>
                      </div>
                    </div>

                    {/* Metrics grid */}
                    <div className="grid grid-cols-3 gap-2 text-center mb-2">
                      <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80">
                        <div className="text-base font-bold text-white">{c.openFindings}</div>
                        <div className="text-[10px] text-slate-400 font-mono">Open</div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80">
                        <div className="text-base font-bold text-rose-400">{regressions}</div>
                        <div className="text-[10px] text-rose-400 font-mono">Regressions</div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80">
                        <div className="text-base font-bold text-amber-400">{recurrings}</div>
                        <div className="text-[10px] text-amber-400 font-mono">Recurring</div>
                      </div>
                    </div>

                    {/* Trend & round */}
                    <div className="flex items-center justify-between text-xs text-slate-400 pt-2 font-mono">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        Round {latestRound} ({c.scanCount} scans)
                      </span>
                      <span className="flex items-center gap-1">
                        {c.trend === "better" ? (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <TrendingDown className="w-3.5 h-3.5" /> Improving
                          </span>
                        ) : c.trend === "worse" ? (
                          <span className="text-rose-400 flex items-center gap-1">
                            <TrendingUp className="w-3.5 h-3.5" /> Degraded
                          </span>
                        ) : (
                          <span className="text-slate-400 flex items-center gap-1">
                            <Minus className="w-3.5 h-3.5" /> Stable
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="p-4 bg-slate-950/60 border-t border-slate-800/80 flex items-center gap-2">
                    <Link
                      href={`/clients/${c.slug}`}
                      className="flex-1 py-2 px-3 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <span>Client Dossier</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    </Link>
                    <Link
                      href={`/clients/${c.slug}/upload`}
                      className="py-2 px-3 rounded-lg text-xs font-semibold bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 flex items-center justify-center gap-1.5 transition-colors"
                      title="Upload scan for this client"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Demo Workflow Explainer */}
      <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800 text-xs">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <Brain className="w-4 h-4 text-cyan-400" />
          The Recidivist Hackathon Workflow:
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-slate-300">
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
            <span className="font-mono text-cyan-400 font-bold block mb-1">1. Pre-seeded History</span>
            Rounds 1–3 are already seeded into each client’s isolated Hindsight memory bank with past fixes.
          </div>
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
            <span className="font-mono text-amber-400 font-bold block mb-1">2. Upload Live Round 4</span>
            Click "Upload" on Northwind Health and trigger Round 4 live scan analysis with 1-click.
          </div>
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
            <span className="font-mono text-rose-400 font-bold block mb-1">3. Memory ON/OFF Toggle</span>
            Compare standard scanner output (blind) vs. Recidivist memory enriched findings with root causes.
          </div>
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
            <span className="font-mono text-emerald-400 font-bold block mb-1">4. Inspect Trace & Profile</span>
            Inspect exact Hindsight recall & reflect calls, and review the auto-updating client security profile.
          </div>
        </div>
      </div>
    </div>
  );
}
