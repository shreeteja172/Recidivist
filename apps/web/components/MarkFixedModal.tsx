"use client";

import { useState } from "react";
import { markFindingFixed } from "../lib/api";
import type { Finding } from "../lib/types";
import { CheckCircle2, X, Brain, AlertCircle } from "lucide-react";

interface MarkFixedModalProps {
  finding: Finding | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedFindingId: number) => void;
}

export function MarkFixedModal({
  finding,
  isOpen,
  onClose,
  onSuccess,
}: MarkFixedModalProps) {
  const [note, setNote] = useState("");
  const [fixedAt, setFixedAt] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !finding) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) {
      setError("Please provide a remediation note describing how it was fixed.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await markFindingFixed(finding.id, note.trim(), fixedAt);
      onSuccess(finding.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark finding fixed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Mark Finding Fixed</h3>
            <p className="text-xs text-slate-400 font-mono">
              {finding.key} · {finding.cwe}
            </p>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs mb-4 space-y-1">
          <p className="font-semibold text-slate-200">{finding.title}</p>
          <p className="text-slate-400 font-mono text-[11px] truncate">
            {finding.file} {finding.line ? `:${finding.line}` : ""}
          </p>
        </div>

        {error && (
          <div className="p-3 mb-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Remediation Note (What changed and what did NOT change?)
            </label>
            <textarea
              required
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Allow-listed sortBy query parameter in the patients handler. The shared buildQuery() helper was not changed."
              className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-xs leading-relaxed"
            />
            <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
              <Brain className="w-3.5 h-3.5 text-cyan-400 inline" />
              Retained in Hindsight memory. Next time an issue appears, Recidivist checks whether this fix held.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Fixed Date
            </label>
            <input
              type="date"
              value={fixedAt}
              onChange={(e) => setFixedAt(e.target.value)}
              className="w-full p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-950/50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{loading ? "Retaining in Memory..." : "Save & Retain Fix"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
