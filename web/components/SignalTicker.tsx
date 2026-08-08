"use client";
// The wire as a proper lower section — a fixed bar in the page layout, not a floater.
import { useEffect, useRef } from "react";
import gsap from "gsap";
import type { Project, SourceEvent } from "@/lib/types";
import { SOURCE_LABELS } from "@/lib/types";
import { RelativeTime } from "./atoms";

export function SignalTicker({
  feed,
  projects,
  onSelect,
}: {
  feed: SourceEvent[];
  projects: Map<string, Project>;
  onSelect: (id: string) => void;
}) {
  const latest = feed[0];
  const flashRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!flashRef.current || !latest) return;
    const tween = gsap.fromTo(flashRef.current, { opacity: 0.35 }, { opacity: 0, duration: 1.6, ease: "power2.out" });
    return () => { tween.kill(); };
  }, [latest?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const project = latest?.project_id ? projects.get(latest.project_id) : null;

  return (
    <footer className="relative z-20 flex h-11 shrink-0 items-center gap-4 border-t border-[var(--border-subtle)] bg-[var(--surface-chrome)] px-6">
      <div ref={flashRef} aria-hidden className="pointer-events-none absolute inset-0 bg-[var(--signal-notable)] opacity-0" />
      <span className="mono relative shrink-0 text-[9px] uppercase tracking-[0.3em] text-[var(--text-faint)]">The wire</span>
      <span className="live-dot relative h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--live)]" />
      {latest ? (
        <button
          onClick={() => latest.project_id && onSelect(latest.project_id)}
          className={`relative flex min-w-0 flex-1 items-center gap-3 text-left ${latest.project_id ? "cursor-pointer" : "cursor-default"}`}
        >
          <span className="mono shrink-0 text-[9px] uppercase tracking-[0.2em]" style={{ color: latest.severity === "low" ? "var(--text-dim)" : latest.severity === "major" ? "var(--signal-major)" : "var(--signal-notable)" }}>
            {SOURCE_LABELS[latest.source] ?? latest.source}
          </span>
          <span className="truncate text-[12.5px] text-[var(--text)]">{latest.title}</span>
          {project && <span className="mono hidden shrink-0 text-[9.5px] text-[var(--text-faint)] md:block">{project.county} Co</span>}
          <span className="ml-auto shrink-0"><RelativeTime iso={latest.ingested_at} /></span>
        </button>
      ) : (
        <span className="text-[12px] text-[var(--text-faint)]">Waiting for first signal…</span>
      )}
    </footer>
  );
}
