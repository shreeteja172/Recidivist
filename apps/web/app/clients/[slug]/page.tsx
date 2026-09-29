"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchClientDetail, refreshClientProfile } from "../../../lib/api";
import type { ClientDetail } from "../../../lib/types";
import { TrendChart } from "../../../components/TrendChart";
import { MemoryTraceDrawer } from "../../../components/MemoryTraceDrawer";
import {
  ArrowLeft,
  Upload,
  Brain,
  RefreshCw,
  Layers,
  Lock,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  ExternalLink,
  ChevronRight,
  Activity,
} from "lucide-react";

export default function ClientDetailPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    if (!slug) return;
    try {
      const res = await fetchClientDetail(slug, true);
      setDetail(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load client details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [slug]);

  const handleRefreshProfile = async () => {
    if (!slug) return;
    setRefreshing(true);
    try {
      await refreshClientProfile(slug);
      // reload data after refresh request
      setTimeout(() => {
        loadData().finally(() => setRefreshing(false));
      }, 1200);
    } catch (e) {
      console.error(e);
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-slate-800 rounded" />
        <div className="h-40 bg-slate-900 rounded-xl" />
        <div className="h-64 bg-slate-900 rounded-xl" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="p-8 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300">
        <p className="font-semibold mb-2">Error loading client dossier</p>
        <p className="text-xs font-mono mb-4">{error || "Client not found"}</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Clients
        </Link>
      </div>
    );
  }

  const { client, repo, trend, rapSheet, profile } = detail;
  const totalOpen = trend.at(-1)?.counts?.open ?? 0;
  const totalRegressions = rapSheet.reduce((acc, curr) => acc + curr.regressions, 0);

  return (
    <div className="space-y-8">
      {/* Back button & Title */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                {client.name}
              </h1>
              <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                {client.industry}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono text-slate-400 mt-1">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                {repo.name} ({repo.stack})
              </span>
              <span className="flex items-center gap-1.5 text-cyan-400">
                <Lock className="w-3.5 h-3.5 text-cyan-500" />
                Bank: {client.bankId}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setTraceOpen(true)}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>Client Memory Trace</span>
          </button>
          <Link
            href={`/clients/${client.slug}/upload`}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-2 transition-colors shadow-lg shadow-cyan-950/50"
          >
            <Upload className="w-4 h-4" />
            <span>Upload New Scan</span>
          </Link>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400 font-mono block mb-1">Scan Rounds</span>
          <span className="text-2xl font-bold text-white">{trend.length}</span>
          <span className="text-[11px] text-slate-500 block mt-1">Chronological audits</span>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400 font-mono block mb-1">Current Open Findings</span>
          <span className="text-2xl font-bold text-amber-400">{totalOpen}</span>
          <span className="text-[11px] text-slate-500 block mt-1">Latest scan state</span>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400 font-mono block mb-1">Regressions Detected</span>
          <span className="text-2xl font-bold text-rose-400">{totalRegressions}</span>
          <span className="text-[11px] text-rose-400/80 block mt-1">Re-opened after fix</span>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400 font-mono block mb-1">Repeat Vulnerability Classes</span>
          <span className="text-2xl font-bold text-cyan-400">{rapSheet.length}</span>
          <span className="text-[11px] text-cyan-400/80 block mt-1">Found in &gt;1 round</span>
        </div>
      </div>

      {/* Trend Chart */}
      <TrendChart trend={trend} />

      {/* Security Profile Box (Hindsight Mental Model) */}
      <div className="p-6 rounded-xl bg-gradient-to-b from-slate-900 via-slate-900/70 to-slate-950 border border-cyan-500/30 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Hindsight Security Profile (Mental Model)
                <span className="text-[10px] font-mono font-normal px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  AI SYNTHESIS
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Self-updating synthesis of team remediation habits, fix durability, and repeat weaknesses
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {profile?.lastRefreshedAt && (
              <span className="text-[11px] text-slate-400 font-mono">
                Refreshed: {new Date(profile.lastRefreshedAt).toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={handleRefreshProfile}
              disabled={refreshing}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-cyan-400" : ""}`} />
              <span>{refreshing ? "Updating..." : "Refresh Profile"}</span>
            </button>
          </div>
        </div>

        <div className="prose prose-invert max-w-none text-xs leading-relaxed text-slate-300 font-sans p-4 rounded-lg bg-slate-950/80 border border-slate-800/80 whitespace-pre-wrap">
          {profile?.content ? (
            profile.content
          ) : (
            <div className="text-slate-500 italic">
              Security profile is formulating. As scan rounds and fix notes accumulate in the client bank, Hindsight automatically consolidates team observations and patterns here. Click "Refresh Profile" to trigger reflection.
            </div>
          )}
        </div>
      </div>

      {/* Rap Sheet (Repeat Vulnerabilities) */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
              <span>Rap Sheet: Repeat Offenses</span>
            </h2>
            <p className="text-xs text-slate-400">
              Vulnerabilities appearing across multiple audits in different files or resurfacing post-fix
            </p>
          </div>
        </div>

        {rapSheet.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-slate-800 text-center text-slate-500 text-sm">
            No repeated vulnerability classes detected across scans yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rapSheet.map((item) => (
              <div
                key={item.cwe}
                className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-400 border border-slate-700">
                        {item.cwe}
                      </span>
                      <h3 className="text-sm font-bold text-white mt-1.5">{item.cweName}</h3>
                    </div>
                    <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      {item.occurrences} Rounds
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 my-3">
                    <span className="text-[11px] text-slate-400 font-mono mr-1">Rounds:</span>
                    {item.rounds.map((r) => (
                      <span
                        key={r}
                        className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-slate-800 text-slate-300 border border-slate-700"
                      >
                        Round {r}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs font-mono">
                  <span className="text-slate-400">
                    Currently Open: <span className="text-amber-400 font-semibold">{item.open}</span>
                  </span>
                  {item.regressions > 0 && (
                    <span className="text-rose-400 font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {item.regressions} Regressed
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Past Scans History */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-slate-400" />
              <span>Past Scan Audits</span>
            </h2>
            <p className="text-xs text-slate-400">Audit history replayed and remembered in Hindsight</p>
          </div>
        </div>

        <div className="space-y-3">
          {trend.map((s) => (
            <div
              key={s.id}
              className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-all flex flex-wrap items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-white font-mono text-sm">
                  R{s.round}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white text-sm">Scan Round {s.round}</span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {s.tool}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    {new Date(s.scannedAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </div>

              {/* Verdict summary chips */}
              <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
                {(s.counts.byVerdict.regression || 0) > 0 && (
                  <span className="px-2 py-1 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30">
                    🔴 {s.counts.byVerdict.regression} Regression
                  </span>
                )}
                {(s.counts.byVerdict.recurring || 0) > 0 && (
                  <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    🟠 {s.counts.byVerdict.recurring} Recurring
                  </span>
                )}
                {(s.counts.byVerdict.persistent || 0) > 0 && (
                  <span className="px-2 py-1 rounded bg-yellow-500/10 text-yellow-300 border border-yellow-500/30">
                    🟡 {s.counts.byVerdict.persistent} Still Open
                  </span>
                )}
                {(s.counts.byVerdict.new || 0) > 0 && (
                  <span className="px-2 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    ⚪ {s.counts.byVerdict.new} New
                  </span>
                )}
              </div>

              <Link
                href={`/scans/${s.id}`}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white flex items-center gap-1.5 transition-colors"
              >
                <span>View Scan Results</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </Link>
            </div>
          ))}
        </div>
      </div>

      <MemoryTraceDrawer
        isOpen={traceOpen}
        onClose={() => setTraceOpen(false)}
        clientSlug={client.slug}
        title={`${client.name} Memory Trace`}
      />
    </div>
  );
}
