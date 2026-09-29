"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchClientDetail, fetchSampleScan, uploadScan } from "../../../../lib/api";
import type { ClientDetail } from "../../../../lib/types";
import {
  ArrowLeft,
  Upload,
  Brain,
  FileCode,
  CheckCircle2,
  AlertCircle,
  Play,
  Layers,
  Sparkles,
} from "lucide-react";

export default function UploadScanPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;

  const [clientDetail, setClientDetail] = useState<ClientDetail | null>(null);
  const [jsonContent, setJsonContent] = useState<string>("");
  const [parsed, setParsed] = useState<any | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);

  useEffect(() => {
    if (slug) {
      fetchClientDetail(slug, false)
        .then(setClientDetail)
        .catch(console.error);

      // Preload Round 4 by default for convenience
      handlePreloadSample(4);
    }
  }, [slug]);

  const handlePreloadSample = async (round: number) => {
    if (!slug) return;
    setLoadingSample(true);
    setSubmitError(null);
    try {
      const data = await fetchSampleScan(slug, round);
      const text = JSON.stringify(data, null, 2);
      setJsonContent(text);
      validateJson(text);
    } catch (err) {
      setSubmitError(`Could not load sample round ${round}`);
    } finally {
      setLoadingSample(false);
    }
  };

  const validateJson = (text: string) => {
    if (!text.trim()) {
      setParsed(null);
      setParseError(null);
      return;
    }
    try {
      const obj = JSON.parse(text);
      if (!obj.repo || !obj.findings || !Array.isArray(obj.findings)) {
        setParseError("JSON must contain 'repo' and a 'findings' array");
        setParsed(null);
        return;
      }
      setParsed(obj);
      setParseError(null);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Invalid JSON");
      setParsed(null);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setJsonContent(val);
    validateJson(val);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setJsonContent(content);
      validateJson(content);
    };
    reader.readAsText(file);
  };

  const handleSubmit = async () => {
    if (!parsed) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await uploadScan(parsed);
      router.push(`/scans/${res.scanId}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Scan ingestion failed");
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/clients/${slug}`}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Upload Security Scan</h1>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Client: <span className="text-slate-200">{clientDetail?.client.name || slug}</span> · Bank:{" "}
              <span className="text-cyan-400">{clientDetail?.client.bankId}</span>
            </p>
          </div>
        </div>
      </div>

      {/* 1-Click Demo Preloaders */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/40 via-slate-900/60 to-slate-900/40 border border-cyan-500/30">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-2 text-cyan-300 text-xs font-semibold">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>1-Click Hackathon Demo Scans:</span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            {loadingSample ? "Loading sample..." : "Pre-configured synthetic rounds"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handlePreloadSample(4)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm shadow-cyan-950/40"
          >
            <Play className="w-3.5 h-3.5 fill-cyan-400 text-cyan-400" />
            <span>Round 4 (Live Demo Scan · Sep 2026)</span>
          </button>
          <button
            type="button"
            onClick={() => handlePreloadSample(3)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            Round 3
          </button>
          <button
            type="button"
            onClick={() => handlePreloadSample(2)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            Round 2
          </button>
          <button
            type="button"
            onClick={() => handlePreloadSample(1)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            Round 1
          </button>
        </div>
      </div>

      {/* Upload & Editor Form */}
      <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-white">Scan Ingestion Payload (JSON)</h2>
          </div>
          <div>
            <label className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer transition-colors inline-flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" />
              <span>Choose .json file</span>
              <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>

        <textarea
          rows={16}
          value={jsonContent}
          onChange={handleTextChange}
          placeholder="Paste scan JSON output (Semgrep, SARIF, or Recidivist scan format)..."
          className="w-full p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500/60 leading-relaxed resize-y"
        />

        {/* Validation summary banner */}
        {parseError && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 font-mono">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Validation Error: {parseError}</span>
          </div>
        )}

        {parsed && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex flex-wrap items-center justify-between gap-3 font-mono">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Valid scan format: Round {parsed.round} ({parsed.tool || "semgrep"})</span>
            </div>
            <div className="flex items-center gap-4 text-slate-400">
              <span>Repo: <span className="text-slate-200">{parsed.repo}</span></span>
              <span>Findings: <span className="text-emerald-400 font-bold">{parsed.findings?.length || 0}</span></span>
            </div>
          </div>
        )}

        {submitError && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 font-mono">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Upload failed: {submitError}</span>
          </div>
        )}

        {/* Action Button */}
        <div className="pt-2 flex items-center justify-end">
          <button
            type="button"
            disabled={!parsed || submitting}
            onClick={handleSubmit}
            className="w-full sm:w-auto px-6 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-xl shadow-cyan-950/60 cursor-pointer"
          >
            <Brain className={`w-4 h-4 ${submitting ? "animate-spin" : ""}`} />
            <span>{submitting ? "Ingesting & Starting Pipeline..." : "Analyze Scan with Recidivist Memory"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
