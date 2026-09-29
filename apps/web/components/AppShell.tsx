"use client";

import { useState } from "react";
import { Navbar } from "./Navbar";
import { MemoryTraceDrawer } from "./MemoryTraceDrawer";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [traceOpen, setTraceOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200">
      <Navbar onOpenGlobalTrace={() => setTraceOpen(true)} />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
      <footer className="border-t border-slate-800/80 bg-slate-950/60 py-6 text-center text-xs text-slate-500 font-mono">
        <p>Recidivist · Hackathon AI Agent with Hindsight Persistent Memory</p>
      </footer>
      <MemoryTraceDrawer
        isOpen={traceOpen}
        onClose={() => setTraceOpen(false)}
        title="Global Hindsight Memory Trace"
      />
    </div>
  );
}
