"use client";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useLiveData } from "@/lib/useLiveData";
import { FeedRail } from "@/components/FeedRail";
import { heatHex, heatScore } from "@/lib/heat";
import { STAGE_LABELS, STAGE_LADDER } from "@/lib/types";

const MapCanvas = dynamic(() => import("@/components/MapCanvas").then((m) => m.MapCanvas), { ssr: false });
const Dossier = dynamic(() => import("@/components/dossier/ProjectDossier").then((m) => m.ProjectDossier), { ssr: false });

function Kpi({ label, value, unit, hot }: { label: string; value: string | number; unit?: string; hot?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-[0.22em] text-[var(--text-faint)]">{label}</span>
      <span
        className="text-[30px] leading-none tracking-tight"
        style={{ fontFamily: "var(--font-display), Georgia, serif", fontWeight: 600, color: hot ? "var(--signal-notable)" : "var(--text)" }}
      >
        {value}
        {unit && <span className="mono ml-1.5 text-[11px] font-normal tracking-normal text-[var(--text-dim)]">{unit}</span>}
      </span>
    </div>
  );
}

export default function Home() {
  const { projects, feed, latestStageChange, hot, connected, signalsToday } = useLiveData();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useMemo(() => [...projects.values()], [projects]);
  const totalMw = useMemo(() => Math.round(list.reduce((s, p) => s + (p.capacity_mw ?? 0), 0)), [list]);
  const earlyCount = useMemo(() => list.filter((p) => STAGE_LADDER.slice(0, 4).includes(p.current_stage)).length, [list]);
  const topOps = useMemo(
    () => list.filter((p) => p.current_stage !== "canceled").map((p) => ({ p, h: heatScore(p) })).sort((a, b) => b.h - a.h).slice(0, 5),
    // heat decays with time; feed changes are the natural recompute pulse
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list, feed.length],
  );

  return (
    <main className="flex flex-col" style={{ height: "100vh" }}>
      <header className="z-20 flex items-end gap-12 border-b border-[var(--line)] px-6 pb-3 pt-3">
        <h1 className="flex flex-col leading-none">
          <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic", fontWeight: 700 }} className="text-[22px] text-[var(--text)]">
            Radar<span className="text-[var(--signal-notable)]">/</span>TX
          </span>
          <span className="mono mt-1 text-[8.5px] uppercase tracking-[0.3em] text-[var(--text-faint)]">energy capex · early warning</span>
        </h1>
        <div className="flex items-end gap-12">
          <Kpi label="Projects tracked" value={list.length} />
          <Kpi label="Pipeline" value={totalMw.toLocaleString()} unit="MW" />
          <Kpi label="Pre-FEED window" value={earlyCount} hot />
          <Kpi label="Signals today" value={signalsToday} />
        </div>
        <span className="mono ml-auto flex items-center gap-2 pb-1 text-[10px] uppercase tracking-[0.25em] text-[var(--text-dim)]">
          <span className={`live-dot inline-block h-1.5 w-1.5 rounded-full ${connected === "connecting" ? "bg-[var(--signal-notable)]" : "bg-[var(--live)]"}`} />
          {connected === "connecting" ? "connecting" : "live"}
        </span>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <MapCanvas
            projects={list}
            projectIndex={projects}
            feed={feed}
            hot={hot}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />

          {/* Top opportunities — the investor lens, pinned to the theater */}
          {!selectedId && (
            <aside className="absolute bottom-8 left-6 z-10 w-[340px]" aria-label="Top opportunities">
              <h2 className="mb-2 flex items-baseline gap-2">
                <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic" }} className="text-[15px] text-[var(--text)]">
                  Where the money should look
                </span>
                <span className="mono text-[8.5px] uppercase tracking-[0.25em] text-[var(--text-faint)]">live rank</span>
              </h2>
              <ol>
                {topOps.map(({ p, h }, i) => (
                  <li key={p.id}>
                    <button
                      onClick={() => setSelectedId(p.id)}
                      className="group flex w-full items-center gap-3 border-t border-[var(--line)] py-2 text-left transition-colors hover:bg-[rgba(255,255,255,0.03)]"
                    >
                      <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic" }} className="w-5 text-[17px] leading-none text-[var(--text-faint)] group-hover:text-[var(--text-dim)]">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] text-[var(--text)]">{p.name}</span>
                        <span className="mono block text-[9.5px] uppercase tracking-wider text-[var(--text-faint)]">
                          {p.county} Co · {p.capacity_mw ? `${Math.round(p.capacity_mw)} MW` : "— MW"} · {STAGE_LABELS[p.current_stage]}
                        </span>
                      </span>
                      <span className="flex w-14 flex-col items-end gap-1">
                        <span className="mono text-[10px]" style={{ color: heatHex(h) }}>{h.toFixed(2)}</span>
                        <span className="h-[3px] w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
                          <span className="block h-full rounded-full" style={{ width: `${Math.round(h * 100)}%`, background: heatHex(h) }} />
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </aside>
          )}

          {selectedId && (
            <Dossier projectId={selectedId} project={projects.get(selectedId) ?? null} onClose={() => setSelectedId(null)} />
          )}

          {latestStageChange && (
            <div key={latestStageChange.id} className="chyron-enter pointer-events-none absolute bottom-8 right-6 z-10 max-w-md border-l-2 border-[var(--signal-major)] bg-[rgba(10,14,19,0.88)] px-4 py-2.5 backdrop-blur">
              <p className="mono text-[9px] uppercase tracking-[0.3em] text-[var(--signal-major)]">Stage call</p>
              <p className="mt-0.5 text-[13px] leading-snug text-[var(--text)]">
                {projects.get(latestStageChange.project_id)?.name ?? "Project"} advances to {STAGE_LABELS[latestStageChange.stage]} · confidence {latestStageChange.confidence.toFixed(2)}
              </p>
            </div>
          )}
        </div>
        <FeedRail feed={feed} projects={projects} onSelect={setSelectedId} />
      </div>
    </main>
  );
}
