"use client";
// The killer interaction: one project's entire stitched story on one screen.
import { useEffect, useRef } from "react";
import gsap from "gsap";
import {
  SOURCE_LABELS, STAGE_LABELS, STAGE_LADDER,
  type Project, type ProjectAlias, type SourceEvent, type StageHistoryRow, type Stage,
} from "@/lib/types";
import { stageHex } from "@/lib/theme";
import { heatHex, heatScore, whyItMatters } from "@/lib/heat";
import { ConfidenceMeter, RelativeTime, SeverityTag, StageBadge } from "@/components/atoms";

export function ProjectDossier({
  projectId,
  project,
  paired,
  events,
  history,
  aliases,
  onSelectProject,
  onClose,
}: {
  projectId: string;
  project: Project | null;
  paired?: { other: Project; km: number } | null;
  events: SourceEvent[];
  history: StageHistoryRow[];
  aliases: ProjectAlias[];
  onSelectProject?: (id: string) => void;
  onClose: () => void;
}) {
  const secRef = useRef<HTMLElement>(null);

  // designed entrance: panel slides in, story beats stagger down the page
  useEffect(() => {
    if (!secRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(secRef.current, { x: -36, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.5, ease: "power3.out" });
      gsap.fromTo(
        secRef.current!.querySelectorAll("[data-beat]"),
        { y: 14, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.45, stagger: 0.06, delay: 0.12, ease: "power2.out" },
      );
    });
    return () => ctx.revert();
  }, [projectId]);

  if (!project) return null;
  const onLadder = STAGE_LADDER.includes(project.current_stage);
  const currentIdx = onLadder ? STAGE_LADDER.indexOf(project.current_stage) : -1;

  return (
    <section
      ref={secRef}
      className="absolute inset-y-0 left-0 z-10 flex w-[480px] max-w-full flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-overlay)] opacity-0 backdrop-blur"
      aria-label={`Dossier: ${project.name}`}
    >
      <header data-beat className="border-b border-[var(--line)] px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontWeight: 600 }} className="text-[21px] leading-tight text-[var(--text)]">
              {project.name}
            </h2>
            <p className="mono mt-1 text-[10px] uppercase tracking-[0.18em] text-[var(--text-dim)]">
              {[project.developer, project.county && `${project.county} Co`, project.capacity_mw && `${project.capacity_mw} MW`]
                .filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex flex-col items-end">
              <span className="text-[9px] uppercase tracking-[0.2em] text-[var(--text-faint)]">heat</span>
              <span style={{ fontFamily: "var(--font-display), Georgia, serif", color: heatHex(heatScore(project)) }} className="text-[22px] leading-none">
                {heatScore(project).toFixed(2)}
              </span>
            </span>
            <button onClick={onClose} aria-label="Close dossier"
              className="mono text-[var(--text-faint)] transition-colors hover:text-[var(--text)]">✕</button>
          </div>
        </div>
        <p className="mt-2.5 border-l-2 pl-2.5 text-[12.5px] italic leading-snug text-[var(--text-dim)]" style={{ borderColor: heatHex(heatScore(project)) }}>
          {whyItMatters(project, heatScore(project))}
        </p>
        {paired && (
          <button
            onClick={() => onSelectProject?.(paired.other.id)}
            className="mt-2.5 flex w-full items-center gap-2.5 border border-[var(--line-strong)] bg-[rgba(255,161,99,0.06)] px-2.5 py-2 text-left transition-colors hover:bg-[rgba(255,161,99,0.12)]"
          >
            <span className="mono text-[8.5px] uppercase tracking-[0.22em] text-[var(--signal-notable)]">
              {project.project_type === "gas_to_power" ? "Serves load" : "Power pairing"}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text)]">{paired.other.name}</span>
            <span className="mono shrink-0 text-[10px] text-[var(--text-dim)]">
              {paired.km} km · behind-the-meter {paired.other.capacity_mw ? `· ${Math.round(paired.other.capacity_mw)} MW` : ""}
            </span>
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Stage ladder */}
        <h3 data-beat className="mb-2 text-[10px] uppercase tracking-[0.25em] text-[var(--text-faint)]">Stage inference</h3>
        <div data-beat className="mb-1 flex items-center gap-1">
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
        <div data-beat className="mb-4 mt-5 flex items-center justify-between">
          <StageBadge stage={project.current_stage} />
          {project.stage_confidence != null && <ConfidenceMeter value={project.stage_confidence} />}
        </div>
        {history.length > 0 && (
          <ol data-beat className="mb-5 space-y-1.5 border-l border-[var(--line)] pl-3">
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
            <h3 data-beat className="mb-2 text-[10px] uppercase tracking-[0.25em] text-[var(--text-faint)]">Resolved identities</h3>
            <div data-beat className="mb-5 flex flex-wrap gap-1.5">
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
        <ol data-beat className="space-y-3">
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
