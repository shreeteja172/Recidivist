"use client";

import { useState } from "react";
import type { ScanSummary } from "../lib/types";

interface TrendChartProps {
  trend: ScanSummary[];
  onSelectRound?: (roundId: number) => void;
}

export function TrendChart({ trend, onSelectRound }: TrendChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!trend || trend.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center border border-dashed border-slate-800 rounded-xl text-slate-500 text-sm">
        No scan history available yet to plot trend
      </div>
    );
  }

  // Calculate scales
  const maxTotal = Math.max(...trend.map((s) => s.counts.total), 5);
  const chartHeight = 220;
  const chartWidth = 560;
  const paddingX = 40;
  const paddingY = 30;
  const innerWidth = chartWidth - paddingX * 2;
  const innerHeight = chartHeight - paddingY * 2;

  const getX = (index: number) => {
    if (trend.length <= 1) return paddingX + innerWidth / 2;
    return paddingX + (index / (trend.length - 1)) * innerWidth;
  };

  const getY = (val: number) => {
    return chartHeight - paddingY - (val / maxTotal) * innerHeight;
  };

  // Generate SVG path for a line
  const makeLinePath = (getter: (s: ScanSummary) => number) => {
    return trend
      .map((s, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getY(getter(s))}`)
      .join(" ");
  };

  const totalPath = makeLinePath((s) => s.counts.total);
  const openPath = makeLinePath((s) => s.counts.open);
  const regressedPath = makeLinePath((s) => s.counts.byVerdict.regression || 0);

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Vulnerability Trajectory Across Rounds</h3>
          <p className="text-xs text-slate-400">Deterministic metrics from PostgreSQL scan history</p>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
            <span className="text-slate-300">Total</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="text-amber-300">Open</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <span className="text-rose-400">Regressions</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-emerald-400">Fixed</span>
          </div>
        </div>
      </div>

      <div className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-56 select-none"
        >
          {/* Horizontal grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
            const y = chartHeight - paddingY - pct * innerHeight;
            const val = Math.round(pct * maxTotal);
            return (
              <g key={idx}>
                <line
                  x1={paddingX}
                  y1={y}
                  x2={chartWidth - paddingX}
                  y2={y}
                  stroke="#1e293b"
                  strokeDasharray="4 4"
                />
                <text
                  x={paddingX - 10}
                  y={y + 4}
                  fill="#64748b"
                  fontSize="10"
                  textAnchor="end"
                  fontFamily="monospace"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Lines */}
          <path
            d={totalPath}
            fill="none"
            stroke="#94a3b8"
            strokeWidth="2"
            strokeDasharray="3 3"
          />
          <path
            d={openPath}
            fill="none"
            stroke="#fbbf24"
            strokeWidth="2.5"
          />
          <path
            d={regressedPath}
            fill="none"
            stroke="#f43f5e"
            strokeWidth="2"
          />

          {/* Dots and vertical hover indicators */}
          {trend.map((s, i) => {
            const x = getX(i);
            const yTotal = getY(s.counts.total);
            const yOpen = getY(s.counts.open);
            const yReg = getY(s.counts.byVerdict.regression || 0);
            const isHovered = hoveredIdx === i;

            return (
              <g
                key={s.id}
                className="cursor-pointer group"
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                onClick={() => onSelectRound?.(s.id)}
              >
                {/* Vertical guideline */}
                <line
                  x1={x}
                  y1={paddingY}
                  x2={x}
                  y2={chartHeight - paddingY}
                  stroke={isHovered ? "#38bdf8" : "#334155"}
                  strokeWidth={isHovered ? "2" : "1"}
                  strokeDasharray={isHovered ? "none" : "2 2"}
                />

                {/* Dots */}
                <circle cx={x} cy={yTotal} r={isHovered ? 5 : 3.5} fill="#94a3b8" />
                <circle cx={x} cy={yOpen} r={isHovered ? 6 : 4.5} fill="#fbbf24" stroke="#0f172a" strokeWidth="2" />
                {(s.counts.byVerdict.regression || 0) > 0 && (
                  <circle cx={x} cy={yReg} r={isHovered ? 6 : 4.5} fill="#f43f5e" stroke="#0f172a" strokeWidth="2" />
                )}

                {/* X axis labels */}
                <text
                  x={x}
                  y={chartHeight - 10}
                  fill={isHovered ? "#38bdf8" : "#94a3b8"}
                  fontSize="11"
                  fontWeight={isHovered ? "bold" : "normal"}
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  R{s.round}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Selected or Hovered Details Card */}
        {hoveredIdx !== null && (
          <div
            className="absolute top-2 right-4 p-3 rounded-lg bg-slate-950/90 border border-slate-700/80 shadow-xl text-xs font-mono pointer-events-none transition-all"
          >
            <div className="font-bold text-white mb-1.5 flex items-center justify-between gap-4">
              <span>Round {trend[hoveredIdx].round}</span>
              <span className="text-slate-400 font-normal">
                {new Date(trend[hoveredIdx].scannedAt).toLocaleDateString()}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
              <span className="text-slate-400">Total Findings:</span>
              <span className="text-right text-slate-200">{trend[hoveredIdx].counts.total}</span>
              <span className="text-amber-400">Open:</span>
              <span className="text-right text-amber-300 font-semibold">{trend[hoveredIdx].counts.open}</span>
              <span className="text-emerald-400">Fixed:</span>
              <span className="text-right text-emerald-300">{trend[hoveredIdx].counts.fixed}</span>
              <span className="text-rose-400">Regressions:</span>
              <span className="text-right text-rose-300 font-semibold">{trend[hoveredIdx].counts.byVerdict.regression || 0}</span>
              <span className="text-cyan-400">Recurring:</span>
              <span className="text-right text-cyan-300">{trend[hoveredIdx].counts.byVerdict.recurring || 0}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
