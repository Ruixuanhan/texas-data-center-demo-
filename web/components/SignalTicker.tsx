"use client";
// The wire as a proper lower section: a strip of the latest signals (the old rail's
// news, rotated to the bottom) — newest slides in from the left, all clickable.
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
  const items = feed.slice(0, 4);
  const latest = items[0];
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rowRef.current || !latest) return;
    const first = rowRef.current.firstElementChild;
    if (!first) return;
    const tl = gsap.timeline();
    tl.fromTo(first, { x: -24, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: "power3.out" })
      .fromTo(first, { backgroundColor: "rgba(255,161,99,0.22)" }, { backgroundColor: "rgba(255,161,99,0)", duration: 1.5, ease: "power2.out", clearProps: "backgroundColor" }, 0);
    return () => { tl.kill(); };
  }, [latest?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <footer className="z-20 flex h-[52px] shrink-0 items-center gap-4 border-t border-[var(--border-subtle)] bg-[var(--surface-chrome)] px-6">
      <span className="mono flex shrink-0 items-center gap-2 text-[9px] uppercase tracking-[0.3em] text-[var(--text-faint)]">
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--live)]" />
        The wire
      </span>
      <div ref={rowRef} className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        {items.map((e) => {
          const project = e.project_id ? projects.get(e.project_id) : null;
          return (
            <button
              key={e.id}
              onClick={() => e.project_id && onSelect(e.project_id)}
              title={e.title}
              className={`flex min-w-0 max-w-[340px] flex-1 items-center gap-2 border border-[var(--line)] px-3 py-1.5 text-left transition-colors ${e.project_id ? "cursor-pointer hover:border-[var(--border-strong)] hover:bg-[rgba(255,255,255,0.04)]" : "cursor-default"}`}
            >
              <span className="mono shrink-0 text-[8.5px] uppercase tracking-[0.18em]" style={{ color: e.severity === "low" ? "var(--text-dim)" : e.severity === "major" ? "var(--signal-major)" : "var(--signal-notable)" }}>
                {SOURCE_LABELS[e.source] ?? e.source}
              </span>
              <span className="truncate text-[11.5px] leading-tight text-[var(--text)]">{e.title}</span>
              <span className="ml-auto shrink-0">
                <RelativeTime iso={e.ingested_at} />
              </span>
              {project && <span className="mono hidden shrink-0 text-[9px] text-[var(--text-faint)] xl:block">{project.county} Co</span>}
            </button>
          );
        })}
        {items.length === 0 && <span className="text-[12px] text-[var(--text-faint)]">Waiting for first signal…</span>}
      </div>
    </footer>
  );
}
