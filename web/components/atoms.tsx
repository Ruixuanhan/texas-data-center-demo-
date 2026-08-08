"use client";
// Core atoms — every one of these gets a Storybook story as a byproduct.
import { useEffect, useState } from "react";
import { SOURCE_LABELS, STAGE_LABELS, type Severity, type Source, type Stage } from "@/lib/types";
import { stageHex } from "@/lib/theme";

export function StageBadge({ stage, confidence }: { stage: Stage; confidence?: number | null }) {
  return (
    <span
      className="mono inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[11px] uppercase tracking-wider"
      style={{ borderColor: stageHex(stage), color: stageHex(stage) }}
    >
      {STAGE_LABELS[stage]}
      {confidence != null && <span style={{ opacity: 0.7 }}>{confidence.toFixed(2)}</span>}
    </span>
  );
}

export function SeverityTag({ severity }: { severity: Severity }) {
  const color = `var(--signal-${severity})`;
  return (
    <span className="mono text-[10px] uppercase tracking-widest" style={{ color }}>
      {severity === "major" ? "◆ major" : severity === "notable" ? "◇ notable" : "· low"}
    </span>
  );
}

export function SourceChip({ source }: { source: Source }) {
  return (
    <span className="mono rounded-sm border border-[var(--line-strong)] px-1 py-px text-[10px] uppercase tracking-wider text-[var(--text-dim)]">
      {SOURCE_LABELS[source] ?? source}
    </span>
  );
}

export function ConfidenceMeter({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-24 overflow-hidden rounded-full bg-[var(--line)]">
        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="mono text-[11px] text-[var(--text-dim)]">{value.toFixed(2)}</span>
    </div>
  );
}

export function RelativeTime({ iso }: { iso: string }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const label =
    s < 60 ? `${Math.floor(s)}s ago`
    : s < 3600 ? `${Math.floor(s / 60)}m ago`
    : s < 86400 ? `${Math.floor(s / 3600)}h ago`
    : `${Math.floor(s / 86400)}d ago`;
  return <span className="mono text-[11px] text-[var(--text-faint)]" suppressHydrationWarning>{label}</span>;
}

export function KpiStat({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">{label}</span>
      <span className="mono text-xl leading-tight text-[var(--text)]">
        {value}
        {unit && <span className="ml-1 text-xs text-[var(--text-dim)]">{unit}</span>}
      </span>
    </div>
  );
}
