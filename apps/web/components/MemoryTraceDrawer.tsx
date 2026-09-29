"use client";

import { useEffect, useState } from "react";
import { fetchMemoryCalls } from "../lib/api";
import type { MemoryCall } from "../lib/types";
import {
  X,
  RefreshCw,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  Search,
} from "lucide-react";

interface MemoryTraceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  scanId?: number;
  clientSlug?: string;
  title?: string;
}

export function MemoryTraceDrawer({
  isOpen,
  onClose,
  scanId,
  clientSlug,
  title = "Hindsight Memory Trace",
}: MemoryTraceDrawerProps) {
  const [calls, setCalls] = useState<MemoryCall[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filterOp, setFilterOp] = useState<string>("all");
  const [search, setSearch] = useState("");

  const loadCalls = async () => {
    setLoading(true);
    try {
      const data = await fetchMemoryCalls({ scanId, clientSlug, limit: 100 });
      setCalls(data);
      if (data.length > 0 && expandedId === null) {
        setExpandedId(data[0].id);
      }
    } catch (e) {
      console.error("Failed to load memory calls", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCalls();
    }
  }, [isOpen, scanId, clientSlug]);

  if (!isOpen) return null;

  const filteredCalls = calls.filter((c) => {
    if (filterOp !== "all" && c.op !== filterOp) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        c.label.toLowerCase().includes(q) ||
        c.bankId.toLowerCase().includes(q) ||
        JSON.stringify(c.request).toLowerCase().includes(q) ||
        JSON.stringify(c.response).toLowerCase().includes(q)
      );
    }
    return true;
  });

  const opColors: Record<string, { bg: string; text: string; border: string }> = {
    recall: { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/30" },
    reflect: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/30" },
    retain: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30" },
    mental_model: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30" },
    bank: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30" },
    consolidate: { bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/30" },
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end transition-opacity animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-slate-950 border-l border-slate-800 shadow-2xl flex flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                {title}
                <span className="text-xs font-mono font-normal text-slate-400 px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700">
                  {calls.length} calls logged
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Direct inspect log of all vector, graph, and LLM reasoning operations in Hindsight
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadCalls}
              disabled={loading}
              className="p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
              title="Refresh logs"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-cyan-400" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Close drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="p-3 border-b border-slate-800 bg-slate-950/80 flex flex-wrap items-center gap-2 text-xs">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search call labels or payloads..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-md bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 text-xs"
            />
          </div>
          <div className="flex items-center gap-1">
            {["all", "recall", "reflect", "retain", "mental_model"].map((op) => (
              <button
                key={op}
                onClick={() => setFilterOp(op)}
                className={`px-2.5 py-1 rounded text-xs font-medium uppercase transition-colors ${
                  filterOp === op
                    ? "bg-slate-700 text-white font-semibold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                }`}
              >
                {op.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        {/* Call List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredCalls.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              {loading ? "Loading memory calls..." : "No memory calls found for this view."}
            </div>
          ) : (
            filteredCalls.map((call) => {
              const isExpanded = expandedId === call.id;
              const opTheme = opColors[call.op] || {
                bg: "bg-slate-800",
                text: "text-slate-300",
                border: "border-slate-700",
              };

              return (
                <div
                  key={call.id}
                  className="rounded-lg border border-slate-800 bg-slate-900/50 hover:border-slate-700 transition-all overflow-hidden"
                >
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : call.id)}
                    className="p-3 flex items-start justify-between gap-3 cursor-pointer select-none"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <button className="text-slate-500 mt-0.5">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold uppercase border ${opTheme.bg} ${opTheme.text} ${opTheme.border}`}
                          >
                            {call.op.replace("_", " ")}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400">{call.bankId}</span>
                          <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span>{call.latencyMs}ms</span>
                          </div>
                          {call.error ? (
                            <span className="flex items-center gap-1 text-[11px] text-rose-400 font-medium">
                              <AlertTriangle className="w-3 h-3" /> Failed
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                              <CheckCircle2 className="w-3 h-3" /> OK
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-mono text-slate-200 line-clamp-2">{call.label}</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">
                      {new Date(call.createdAt).toLocaleTimeString()}
                    </span>
                  </div>

                  {/* Expanded JSON Inspector */}
                  {isExpanded && (
                    <div className="p-3 pt-0 border-t border-slate-800/80 bg-slate-950/70 text-xs font-mono space-y-3">
                      {call.error && (
                        <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300">
                          <span className="font-semibold text-rose-400">Error:</span> {call.error}
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between text-slate-400 text-[11px] uppercase tracking-wider mb-1 font-semibold">
                          <span>Request Payload</span>
                          <button
                            onClick={() => navigator.clipboard.writeText(JSON.stringify(call.request, null, 2))}
                            className="hover:text-white transition-colors"
                          >
                            Copy
                          </button>
                        </div>
                        <pre className="p-2.5 rounded bg-slate-900 border border-slate-800/80 text-cyan-300/90 overflow-x-auto text-[11px] max-h-48 leading-relaxed">
                          {JSON.stringify(call.request, null, 2)}
                        </pre>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-slate-400 text-[11px] uppercase tracking-wider mb-1 font-semibold">
                          <span>Hindsight Response</span>
                          <button
                            onClick={() => navigator.clipboard.writeText(JSON.stringify(call.response, null, 2))}
                            className="hover:text-white transition-colors"
                          >
                            Copy
                          </button>
                        </div>
                        <pre className="p-2.5 rounded bg-slate-900 border border-slate-800/80 text-emerald-300/90 overflow-x-auto text-[11px] max-h-60 leading-relaxed">
                          {JSON.stringify(call.response, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-slate-800 bg-slate-900/60 text-center text-xs text-slate-400 font-mono">
          All calls recorded in PostgreSQL `memory_calls` via @recidivist/memory `traced()`
        </div>
      </div>
    </div>
  );
}
