"use client";
import type { Project, SourceEvent } from "@/lib/types";
import { RelativeTime, SeverityTag, SourceChip } from "./atoms";

export function FeedRail({
  feed,
  projects,
  onSelect,
}: {
  feed: SourceEvent[];
  projects: Map<string, Project>;
  onSelect: (projectId: string) => void;
}) {
  return (
    <aside
      className="flex h-full w-[var(--rail-w)] shrink-0 flex-col border-l border-[var(--line)] bg-[var(--bg-raise)]"
      aria-label="Live signal feed"
    >
      <header className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
        <span className="text-[11px] uppercase tracking-[0.2em] text-[var(--text-dim)]">Signal wire</span>
        <span className="mono flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[var(--live)]">
          <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-[var(--live)]" /> live
        </span>
      </header>
      <div className="flex-1 overflow-y-auto">
        {feed.map((e, i) => {
          const project = e.project_id ? projects.get(e.project_id) : null;
          return (
            <button
              key={e.id}
              onClick={() => e.project_id && onSelect(e.project_id)}
              className={`block w-full border-b border-[var(--line)] px-4 py-3 text-left transition-colors hover:bg-[var(--bg-panel)] ${i === 0 ? "feed-item-new" : ""} ${e.project_id ? "cursor-pointer" : "cursor-default"}`}
            >
              <div className="mb-1 flex items-center gap-2">
                <SourceChip source={e.source} />
                <SeverityTag severity={e.severity} />
                <span className="ml-auto"><RelativeTime iso={e.ingested_at} /></span>
              </div>
              <p className="text-[13px] leading-snug text-[var(--text)]">{e.title}</p>
              <p className="mt-0.5 text-[11px] text-[var(--text-faint)]">
                {project ? `${project.name} · ${project.county ?? ""} Co` : "Unattributed signal — resolution pending"}
              </p>
            </button>
          );
        })}
        {feed.length === 0 && (
          <p className="px-4 py-6 text-[12px] text-[var(--text-faint)]">Waiting for first signal…</p>
        )}
      </div>
    </aside>
  );
}
