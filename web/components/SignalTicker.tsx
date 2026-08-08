"use client";
// The wire, demoted to a single breathing line — liveness stays visible without a rail.
import { useEffect, useRef } from "react";
import gsap from "gsap";
import type { Project, SourceEvent } from "@/lib/types";
import { SOURCE_LABELS } from "@/lib/types";

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
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!ref.current || !latest) return;
    const tl = gsap.timeline();
    tl.fromTo(ref.current, { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.45, ease: "power3.out" })
      .fromTo(ref.current, { backgroundColor: "rgba(255,161,99,0.14)" }, { backgroundColor: "rgba(19,28,40,0.9)", duration: 1.4, ease: "power2.out" }, 0);
    return () => { tl.kill(); };
  }, [latest?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!latest) return null;
  const project = latest.project_id ? projects.get(latest.project_id) : null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center pb-2.5">
      <button
        ref={ref}
        onClick={() => latest.project_id && onSelect(latest.project_id)}
        className={`pointer-events-auto flex max-w-[760px] items-center gap-3 border border-[var(--line)] bg-[rgba(19,28,40,0.9)] px-4 py-2 backdrop-blur-md ${latest.project_id ? "cursor-pointer hover:border-[var(--line-strong)]" : ""}`}
      >
        <span className="live-dot h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--live)]" />
        <span className="mono shrink-0 text-[9px] uppercase tracking-[0.2em]" style={{ color: `var(--signal-${latest.severity})` }}>
          {SOURCE_LABELS[latest.source] ?? latest.source}
        </span>
        <span className="truncate text-[12px] text-[var(--text)]">{latest.title}</span>
        {project && <span className="mono hidden shrink-0 text-[9.5px] text-[var(--text-faint)] sm:block">{project.county} Co</span>}
      </button>
    </div>
  );
}
