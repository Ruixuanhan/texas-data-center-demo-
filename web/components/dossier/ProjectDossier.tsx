"use client";
// The killer interaction: one project's entire stitched story on one screen.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  SOURCE_LABELS, STAGE_LABELS, STAGE_LADDER,
  type Project, type ProjectAlias, type SourceEvent, type StageHistoryRow, type Stage,
} from "@/lib/types";
import { stageHex } from "@/lib/theme";
import { ConfidenceMeter, RelativeTime, SeverityTag, StageBadge } from "@/components/atoms";

export function ProjectDossier({
  projectId,
  project,
  onClose,
}: {
  projectId: string;
  project: Project | null;
  onClose: () => void;
}) {
  const [aliases, setAliases] = useState<ProjectAlias[]>([]);
  const [events, setEvents] = useState<SourceEvent[]>([]);
  const [history, setHistory] = useState<StageHistoryRow[]>([]);

  useEffect(() => {
    const db = supabase();
    let live = true;
    (async () => {
      const [a, e, h] = await Promise.all([
        db.from("project_aliases").select("*").eq("project_id", projectId),
        db.from("source_events").select("*").eq("project_id", projectId).order("occurred_at", { ascending: false }).limit(40),
        db.from("stage_history").select("*").eq("project_id", projectId).order("inferred_at", { ascending: false }),
      ]);
      if (!live) return;
      setAliases((a.data as ProjectAlias[]) ?? []);
      setEvents((e.data as SourceEvent[]) ?? []);
      setHistory((h.data as StageHistoryRow[]) ?? []);
    })();
    return () => { live = false; };
  }, [projectId]);

  if (!project) return null;
  const onLadder = STAGE_LADDER.includes(project.current_stage);
  const currentIdx = onLadder ? STAGE_LADDER.indexOf(project.current_stage) : -1;

  return (
    <section
      className="absolute inset-y-0 left-0 z-10 flex w-[480px] max-w-full flex-col border-r border-[var(--line)] bg-[var(--bg)]/95 backdrop-blur"
      aria-label={`Dossier: ${project.name}`}
    >
      <header className="border-b border-[var(--line)] px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold leading-tight text-[var(--text)]">{project.name}</h2>
            <p className="mt-0.5 text-[12px] text-[var(--text-dim)]">
              {[project.developer, project.county && `${project.county} Co`, project.capacity_mw && `${project.capacity_mw} MW`]
                .filter(Boolean).join(" · ")}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close dossier"
            className="mono text-[var(--text-faint)] transition-colors hover:text-[var(--text)]">✕</button>
        </div>
        {project.headline && <p className="mt-2 text-[12px] italic text-[var(--text-dim)]">{project.headline}</p>}
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Stage ladder */}
        <h3 className="mb-2 text-[10px] uppercase tracking-[0.25em] text-[var(--text-faint)]">Stage inference</h3>
        <div className="mb-1 flex items-center gap-1">
          {STAGE_LADDER.map((s, i) => (
            <div key={s} className="group relative flex-1">
              <div
                className="h-1.5 rounded-sm transition-all"
                style={{
                  background: i <= currentIdx ? stageHex(s) : "var(--line)",
                  boxShadow: i === currentIdx ? `0 0 8px ${stageHex(s)}` : undefined,
                }}
              />
              <span className="mono absolute -bottom-4 left-0 hidden text-[9px] uppercase text-[var(--text-faint)] group-hover:block">
                {STAGE_LABELS[s]}
              </span>
            </div>
          ))}
        </div>
        <div className="mb-4 mt-5 flex items-center justify-between">
          <StageBadge stage={project.current_stage} />
          {project.stage_confidence != null && <ConfidenceMeter value={project.stage_confidence} />}
        </div>
        {history.length > 0 && (
          <ol className="mb-5 space-y-1.5 border-l border-[var(--line)] pl-3">
            {history.map((h) => (
              <li key={h.id} className="text-[12px]">
                <span className="mono" style={{ color: stageHex(h.stage as Stage) }}>{STAGE_LABELS[h.stage]}</span>
                <span className="mono ml-2 text-[var(--text-faint)]">{h.confidence.toFixed(2)} · {h.inferred_by}</span>
                {h.rationale && <p className="text-[11px] text-[var(--text-dim)]">{h.rationale}</p>}
              </li>
            ))}
          </ol>
        )}

        {/* Alias cluster — entity resolution made visible */}
        {aliases.length > 0 && (
          <>
            <h3 className="mb-2 text-[10px] uppercase tracking-[0.25em] text-[var(--text-faint)]">Resolved identities</h3>
            <div className="mb-5 flex flex-wrap gap-1.5">
              <span className="mono rounded-sm bg-[var(--bg-panel)] px-2 py-1 text-[11px] text-[var(--text)]">{project.name}</span>
              {aliases.map((a) => (
                <span key={a.id} className="mono rounded-sm border border-dashed border-[var(--line-strong)] px-2 py-1 text-[11px] text-[var(--text-dim)]">
                  {a.alias}
                  <span className="ml-1.5 text-[var(--text-faint)]">{a.alias_type} · {(a.confidence ?? 0).toFixed(2)}</span>
                </span>
              ))}
            </div>
          </>
        )}

        {/* Source timeline with provenance */}
        <h3 className="mb-2 text-[10px] uppercase tracking-[0.25em] text-[var(--text-faint)]">
          Source record · {events.length} filings
        </h3>
        <ol className="space-y-3">
          {events.map((e) => (
            <li key={e.id} className="border-l-2 pl-3" style={{ borderColor: `var(--signal-${e.severity})` }}>
              <div className="flex items-center gap-2">
                <span className="mono text-[10px] uppercase tracking-wider text-[var(--accent)]">{SOURCE_LABELS[e.source] ?? e.source}</span>
                <SeverityTag severity={e.severity} />
                <span className="ml-auto"><RelativeTime iso={e.occurred_at ?? e.ingested_at} /></span>
              </div>
              <p className="mt-0.5 text-[13px] leading-snug text-[var(--text)]">{e.title}</p>
              {e.url && (
                <a href={e.url} target="_blank" rel="noreferrer"
                  className="mono text-[10px] text-[var(--text-faint)] underline decoration-dotted hover:text-[var(--accent)]">
                  source filing ↗
                </a>
              )}
            </li>
          ))}
          {events.length === 0 && <p className="text-[12px] text-[var(--text-faint)]">No filings recorded yet.</p>}
        </ol>
      </div>
    </section>
  );
}
