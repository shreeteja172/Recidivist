"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchHealth } from "../lib/api";
import type { HealthStatus } from "../lib/types";
import { ShieldAlert, Database, Cpu, ExternalLink, Activity } from "lucide-react";

export function Navbar({ onOpenGlobalTrace }: { onOpenGlobalTrace?: () => void }) {
  const pathname = usePathname();
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    fetchHealth()
      .then(setHealth)
      .catch(() => setHealth({ ok: false, db: false, hindsight: { ok: false, error: "Offline" } }));
  }, []);

  return (
    <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 group-hover:border-red-500/60 transition-colors shadow-sm shadow-red-950/40">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-white text-base">RECIDIVIST</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  HINDSIGHT
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">The agent that remembers who reoffends</p>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1 pl-4 border-l border-slate-800">
            <Link
              href="/"
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                pathname === "/"
                  ? "bg-slate-800/80 text-white"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              Clients
            </Link>
            <Link
              href="/clients/northwind-health"
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                pathname.includes("northwind-health")
                  ? "bg-slate-800/80 text-white"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              Northwind
            </Link>
            <Link
              href="/clients/ledgerly"
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                pathname.includes("ledgerly")
                  ? "bg-slate-800/80 text-white"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              Ledgerly
            </Link>
            <Link
              href="/clients/brightpath"
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                pathname.includes("brightpath")
                  ? "bg-slate-800/80 text-white"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              Brightpath
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {/* Health Indicators */}
          <div className="hidden sm:flex items-center gap-3 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] font-mono">
            <div className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-slate-400" />
              <span className={health?.db ? "text-emerald-400" : "text-rose-400"}>
                Postgres
              </span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  health?.db ? "bg-emerald-400" : "bg-rose-400"
                }`}
              />
            </div>
            <div className="w-px h-3 bg-slate-700" />
            <div className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-slate-400" />
              <span className={health?.hindsight?.ok ? "text-emerald-400" : "text-amber-400"}>
                Hindsight
              </span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  health?.hindsight?.ok ? "bg-emerald-400" : "bg-amber-400 animate-pulse"
                }`}
              />
            </div>
          </div>

          {/* Hindsight UI link */}
          <a
            href="http://localhost:9999"
            target="_blank"
            rel="noopener noreferrer"
            title="Open Hindsight UI (:9999)"
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800/80 transition-colors"
          >
            <span>Hindsight UI</span>
            <ExternalLink className="w-3 h-3 text-slate-500" />
          </a>

          {/* Trace button */}
          {onOpenGlobalTrace && (
            <button
              onClick={onOpenGlobalTrace}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>Memory Trace</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
