"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  deleteScan,
  fetchScanDetail,
  rerunScan,
} from "../../../lib/api";
import type { Finding, PriorFinding, ScanDetail, Severity, Verdict } from "../../../lib/types";
import { MarkFixedModal } from "../../../components/MarkFixedModal";
import { MemoryTraceDrawer } from "../../../components/MemoryTraceDrawer";
import {
  ArrowLeft,
  Brain,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RotateCw,
  Trash2,
  Activity,
  Layers,
  Calendar,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Filter,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Info,
  ShieldAlert,
} from "lucide-react";

export default function ScanPage() {
  const params = useParams();
  const router = useRouter();
  const scanId = Number(params?.id);

  const [detail, setDetail] = useState<ScanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Demo toggle: Memory ON / OFF
  const [memoryEnabled, setMemoryEnabled] = useState(true);

  // Filters
  const [verdictFilter, setVerdictFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  // Modals & Drawers
  const [traceOpen, setTraceOpen] = useState(false);
  const [fixingFinding, setFixingFinding] = useState<Finding | null>(null);
  const [selectedPrior, setSelectedPrior] = useState<PriorFinding | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Polling logic while pipeline runs
  const loadData = async () => {
    if (!scanId) return;
    try {
      const res = await fetchScanDetail(scanId);
      setDetail(res);
      setError(null);
      return res;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scan");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Poll every 1s if scan is in progress
    const interval = setInterval(async () => {
      if (detail && detail.scan.stage !== "done" && detail.scan.stage !== "failed") {
        await loadData();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [scanId, detail?.scan.stage]);

  const handleRerun = async () => {
    if (!scanId) return;
    setRerunning(true);
    try {
      await rerunScan(scanId);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Rerun failed");
    } finally {
      setRerunning(false);
    }
  };

  const handleDelete = async () => {
    if (!scanId || !confirm("Delete this scan and forget its memories for demo rehearsal?")) return;
    setDeleting(true);
    try {
      await deleteScan(scanId);
      if (detail) {
        router.push(`/clients/${detail.client.slug}`);
      } else {
        router.push("/");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  };

  const handleFixSuccess = () => {
    loadData();
  };

  if (loading && !detail) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-slate-800 rounded" />
        <div className="h-32 bg-slate-900 rounded-xl" />
        <div className="h-96 bg-slate-900 rounded-xl" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="p-8 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300">
        <p className="font-semibold mb-2">Error loading scan #{scanId}</p>
        <p className="text-xs font-mono mb-4">{error || "Scan not found"}</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const { scan, client, repo, progress, counts, findings } = detail;
  const isRunning = scan.stage !== "done" && scan.stage !== "failed";

  // Filter findings
  const filteredFindings = findings.filter((f) => {
    if (verdictFilter !== "all" && f.verdict !== verdictFilter) return false;
    if (severityFilter !== "all" && f.severity !== severityFilter) return false;
    return true;
  });

  const severityColors: Record<Severity, string> = {
    critical: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    high: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    medium: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    low: "bg-slate-800 text-slate-300 border-slate-700",
  };

  return (
    <div className="space-y-8">
      {/* Top Navigation & Status */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/clients/${client.slug}`}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Scan Audit #{scan.id} · Round {scan.round}
              </h1>
              <span
                className={`text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full border ${
                  scan.stage === "done"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : scan.stage === "failed"
                    ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                    : "bg-cyan-500/10 text-cyan-400 border-cyan-500/30 animate-pulse"
                }`}
              >
                {scan.stage.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono text-slate-400 mt-1">
              <span>Client: <span className="text-slate-200">{client.name}</span></span>
              <span>Repo: <span className="text-slate-200">{repo.name}</span></span>
              <span>Tool: <span className="text-slate-200">{scan.tool}</span></span>
              <span>Date: <span className="text-slate-200">{new Date(scan.scannedAt).toLocaleDateString()}</span></span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setTraceOpen(true)}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>Scan Memory Trace</span>
          </button>
          <button
            onClick={handleRerun}
            disabled={rerunning || isRunning}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer"
            title="Re-run pipeline"
          >
            <RotateCw className={`w-3.5 h-3.5 ${rerunning ? "animate-spin text-cyan-400" : ""}`} />
            <span>Re-analyze</span>
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting || isRunning}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer"
            title="Delete scan (demo rehearsal)"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Analyzing Live Checklist (Shown when running) */}
      {isRunning && (
        <div className="p-6 rounded-xl bg-gradient-to-b from-slate-900 via-slate-900/80 to-slate-950 border border-cyan-500/40 shadow-2xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
              <Brain className="w-5 h-5 animate-pulse" />
              <span>Analyzing Scan with Hindsight Memory ({client.bankId})</span>
            </div>
            <span className="text-xs font-mono text-slate-400">Live Stage: {scan.stage}</span>
          </div>

          <div className="space-y-2.5 font-mono text-xs">
            <div className="flex items-center gap-2.5 text-emerald-400">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Saved {progress.findings} findings to PostgreSQL repository state</span>
            </div>

            <div className="flex items-center gap-2.5">
              {progress.recalls >= progress.findings && progress.findings > 0 ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <RotateCw className="w-4 h-4 text-cyan-400 animate-spin" />
              )}
              <span className={progress.recalls >= progress.findings ? "text-slate-300" : "text-cyan-300"}>
                Recalling historical facts from memory bank ({progress.recalls}/{progress.findings} recall calls completed)
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              {progress.reflects > 0 ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : progress.recalls >= progress.findings && progress.findings > 0 ? (
                <RotateCw className="w-4 h-4 text-purple-400 animate-spin" />
              ) : (
                <Clock className="w-4 h-4 text-slate-600" />
              )}
              <span className={progress.reflects > 0 ? "text-slate-300" : progress.recalls >= progress.findings ? "text-purple-300" : "text-slate-500"}>
                Reasoning over past scans & fixes with Hindsight reflect (determining regressions & repeat patterns)
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              {progress.retains > 0 ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : progress.reflects > 0 ? (
                <RotateCw className="w-4 h-4 text-amber-400 animate-spin" />
              ) : (
                <Clock className="w-4 h-4 text-slate-600" />
              )}
              <span className={progress.retains > 0 ? "text-slate-300" : progress.reflects > 0 ? "text-amber-300" : "text-slate-500"}>
                Retaining this scan's findings in Hindsight for future quarters
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Brief Summary (if available) */}
      {scan.brief && (
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 flex items-start gap-3">
          <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-white block mb-0.5 font-mono uppercase text-[11px] tracking-wider">
              Hindsight Synthesis Brief
            </span>
            <p className="leading-relaxed">{scan.brief}</p>
          </div>
        </div>
      )}

      {/* MEMORY ON / OFF TOGGLE (The Hackathon Showcase Control) */}
      <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMemoryEnabled(!memoryEnabled)}
            className="flex items-center gap-2 cursor-pointer group"
          >
            {memoryEnabled ? (
              <ToggleRight className="w-9 h-9 text-cyan-400 transition-transform group-hover:scale-105" />
            ) : (
              <ToggleLeft className="w-9 h-9 text-slate-500 transition-transform group-hover:scale-105" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">
                  Memory Enrichment:{" "}
                  <span className={memoryEnabled ? "text-cyan-400" : "text-slate-400"}>
                    {memoryEnabled ? "ON" : "OFF"}
                  </span>
                </span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                    memoryEnabled
                      ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  {memoryEnabled ? "Recidivist Memory Active" : "Standard Scanner View"}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {memoryEnabled
                  ? "Enriched with client history, repeat root causes, regression receipts, and durable fixes."
                  : "Showing raw scanner output only. Standard scanners treat every audit as a blank slate."}
              </p>
            </div>
          </button>
        </div>

        {/* Counts summary */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300">
            Total: <span className="font-bold text-white">{counts.total}</span>
          </span>
          {memoryEnabled ? (
            <>
              <span className="px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300">
                🔴 {counts.byVerdict.regression} Regression
              </span>
              <span className="px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300">
                🟠 {counts.byVerdict.recurring} Recurring
              </span>
              <span className="px-2.5 py-1 rounded bg-yellow-500/10 border border-yellow-500/30 text-yellow-300">
                🟡 {counts.byVerdict.persistent} Still Open
              </span>
              <span className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300">
                ⚪ {counts.byVerdict.new} New
              </span>
            </>
          ) : (
            <span className="text-slate-500 text-xs italic">
              All {counts.total} appear as generic new findings
            </span>
          )}
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-slate-500 flex items-center gap-1 mr-1">
            <Filter className="w-3.5 h-3.5" /> Verdict:
          </span>
          {["all", "regression", "recurring", "persistent", "new"].map((v) => (
            <button
              key={v}
              onClick={() => setVerdictFilter(v)}
              className={`px-2.5 py-1 rounded uppercase transition-colors ${
                verdictFilter === v
                  ? "bg-slate-700 text-white font-semibold"
                  : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Severity:</span>
          {["all", "critical", "high", "medium", "low"].map((s) => (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              className={`px-2 py-1 rounded capitalize transition-colors ${
                severityFilter === s
                  ? "bg-slate-700 text-white font-semibold"
                  : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Findings List */}
      <div className="space-y-4">
        {filteredFindings.length === 0 ? (
          <div className="p-8 rounded-xl border border-dashed border-slate-800 text-center text-slate-500 text-sm">
            No findings match the selected filters.
          </div>
        ) : (
          filteredFindings.map((f) => {
            const hasHistory = f.priorFindings && f.priorFindings.length > 0;

            return (
              <div
                key={f.id}
                className={`rounded-xl border bg-slate-900/60 transition-all overflow-hidden ${
                  !memoryEnabled
                    ? "border-slate-800"
                    : f.verdict === "regression"
                    ? "border-rose-500/50 shadow-lg shadow-rose-950/20"
                    : f.verdict === "recurring"
                    ? "border-amber-500/40 shadow-lg shadow-amber-950/20"
                    : f.verdict === "persistent"
                    ? "border-yellow-500/30"
                    : "border-slate-800"
                }`}
              >
                {/* Memory Verdict Banner (Only when Memory is ON) */}
                {memoryEnabled && (
                  <div
                    className={`px-4 py-2 border-b flex flex-wrap items-center justify-between gap-2 text-xs font-mono ${
                      f.verdict === "regression"
                        ? "bg-rose-500/15 border-rose-500/30 text-rose-300"
                        : f.verdict === "recurring"
                        ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                        : f.verdict === "persistent"
                        ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-300"
                        : "bg-slate-800/60 border-slate-800 text-slate-400"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold">
                        {f.verdict === "regression" && "🔴 REGRESSION"}
                        {f.verdict === "recurring" && `🟠 RECURRING · ${f.occurrence || 2}nd offense`}
                        {f.verdict === "persistent" && "🟡 STILL OPEN"}
                        {f.verdict === "new" && "⚪ NEW"}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        (source: {f.verdictSource})
                      </span>
                    </div>

                    {/* Prior occurrences chips */}
                    {hasHistory && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] text-slate-400">Prior occurrences:</span>
                        {f.priorFindings!.map((pf) => (
                          <button
                            key={pf.findingId}
                            onClick={() => setSelectedPrior(pf)}
                            className="px-2 py-0.5 rounded text-[11px] bg-slate-900/90 border border-slate-700 hover:border-slate-500 text-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <span>Round {pf.round}</span>
                            {pf.status === "fixed" && (
                              <span className="text-emerald-400 font-bold">✓</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Finding Details */}
                <div className="p-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold uppercase border ${
                            severityColors[f.severity]
                          }`}
                        >
                          {f.severity}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-cyan-400 border border-slate-700">
                          {f.cwe}
                        </span>
                        <span className="text-xs text-slate-400 font-medium">{f.cweName}</span>
                      </div>
                      <h3 className="text-base font-bold text-white tracking-tight">{f.title}</h3>
                    </div>

                    {/* Mark Fixed CTA */}
                    <div className="flex items-center gap-2">
                      {f.status === "fixed" ? (
                        <span className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5" /> Fixed
                        </span>
                      ) : (
                        <button
                          onClick={() => setFixingFinding(f)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white border border-slate-700 hover:border-emerald-500 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Mark Fixed</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* File & Endpoint */}
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs font-mono text-slate-400 bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80">
                    <div>
                      File: <span className="text-slate-200">{f.file}</span>
                      {f.line && <span className="text-cyan-400">:{f.line}</span>}
                    </div>
                    {f.endpoint && (
                      <div>
                        Endpoint: <span className="text-slate-200">{f.endpoint}</span>
                      </div>
                    )}
                    {f.sink && (
                      <div>
                        Sink: <span className="text-amber-400">{f.sink}</span>
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-300 leading-relaxed">{f.description}</p>

                  {/* Memory Enrichment: Root Cause & Durable Fix (Only when Memory is ON) */}
                  {memoryEnabled && (f.rootCause || f.durableFix) && (
                    <div className="p-3.5 rounded-lg bg-slate-950/90 border border-cyan-500/30 text-xs space-y-2">
                      {f.rootCause && (
                        <div>
                          <span className="text-amber-400 font-mono font-semibold block mb-0.5 text-[11px] uppercase">
                            Root Cause Correlation:
                          </span>
                          <p className="text-slate-200 leading-relaxed">{f.rootCause}</p>
                        </div>
                      )}
                      {f.durableFix && (
                        <div>
                          <span className="text-emerald-400 font-mono font-semibold block mb-0.5 text-[11px] uppercase">
                            Durable Remediation:
                          </span>
                          <p className="text-slate-200 leading-relaxed">{f.durableFix}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Fix note (if already fixed) */}
                  {f.status === "fixed" && f.fixNote && (
                    <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-xs font-mono text-emerald-300">
                      <span className="font-semibold block mb-0.5">Recorded Fix Note:</span>
                      <p className="text-slate-300">{f.fixNote}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Prior Finding Receipt Details Modal */}
      {selectedPrior && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setSelectedPrior(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              ✕
            </button>
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert className="w-5 h-5 text-cyan-400" />
              <h3 className="text-sm font-bold text-white">Historical Receipt: Round {selectedPrior.round}</h3>
            </div>
            <div className="space-y-2 text-xs font-mono text-slate-300 bg-slate-950 p-4 rounded-lg border border-slate-800">
              <p>Key: <span className="text-cyan-400">{selectedPrior.key}</span></p>
              <p>File: <span className="text-slate-200">{selectedPrior.file}</span></p>
              {selectedPrior.endpoint && <p>Endpoint: <span className="text-slate-200">{selectedPrior.endpoint}</span></p>}
              <p>Scanned At: <span className="text-slate-400">{new Date(selectedPrior.scannedAt).toLocaleDateString()}</span></p>
              <p>Status: <span className={selectedPrior.status === "fixed" ? "text-emerald-400 font-bold" : "text-amber-400"}>{selectedPrior.status.toUpperCase()}</span></p>
              {selectedPrior.fixNote && (
                <div className="pt-2 border-t border-slate-800 mt-2">
                  <span className="text-slate-400 block mb-1">Fix Note:</span>
                  <p className="text-emerald-300 font-sans italic">{selectedPrior.fixNote}</p>
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setSelectedPrior(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 text-xs font-medium text-white hover:bg-slate-700"
              >
                Close Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark Fixed Modal */}
      <MarkFixedModal
        finding={fixingFinding}
        isOpen={fixingFinding !== null}
        onClose={() => setFixingFinding(null)}
        onSuccess={handleFixSuccess}
      />

      {/* Memory Trace Drawer */}
      <MemoryTraceDrawer
        isOpen={traceOpen}
        onClose={() => setTraceOpen(false)}
        scanId={scan.id}
        title={`Scan #${scan.id} Memory Trace`}
      />
    </div>
  );
}
