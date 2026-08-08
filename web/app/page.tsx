"use client";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useLiveData } from "@/lib/useLiveData";
import { FeedRail } from "@/components/FeedRail";
import { KpiStat } from "@/components/atoms";
import { STAGE_LADDER } from "@/lib/types";

const MapCanvas = dynamic(() => import("@/components/MapCanvas").then((m) => m.MapCanvas), { ssr: false });
const Dossier = dynamic(() => import("@/components/dossier/ProjectDossier").then((m) => m.ProjectDossier), { ssr: false });

export default function Home() {
  const { projects, feed, latestStageChange, hot, connected, signalsToday } = useLiveData();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useMemo(() => [...projects.values()], [projects]);
  const totalMw = useMemo(() => Math.round(list.reduce((s, p) => s + (p.capacity_mw ?? 0), 0)), [list]);
  const earlyCount = useMemo(() => list.filter((p) => STAGE_LADDER.slice(0, 4).includes(p.current_stage)).length, [list]);

  return (
    <main className="flex flex-col" style={{ height: "100vh" }}>
      <header className="flex items-center gap-10 border-b border-[var(--line)] bg-[var(--bg-raise)] px-5 py-2.5">
        <h1 className="mono text-sm font-semibold uppercase tracking-[0.3em] text-[var(--text)]">
          Radar<span className="text-[var(--accent)]">/</span>TX
        </h1>
        <div className="flex gap-10">
          <KpiStat label="Projects tracked" value={list.length} />
          <KpiStat label="Pipeline" value={totalMw.toLocaleString()} unit="MW" />
          <KpiStat label="Early stage" value={earlyCount} />
          <KpiStat label="Signals today" value={signalsToday} />
        </div>
        <span className="mono ml-auto flex items-center gap-2 text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
          <span className={`live-dot inline-block h-1.5 w-1.5 rounded-full ${connected === "connecting" ? "bg-[var(--signal-notable)]" : "bg-[var(--live)]"}`} />
          {connected === "realtime" ? "live · realtime" : connected === "polling" ? "live" : "connecting"}
        </span>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <MapCanvas projects={list} hot={hot} selectedId={selectedId} onSelect={setSelectedId} />
          {selectedId && (
            <Dossier
              projectId={selectedId}
              project={projects.get(selectedId) ?? null}
              onClose={() => setSelectedId(null)}
            />
          )}
          {latestStageChange && (
            <div key={latestStageChange.id} className="chyron-enter pointer-events-none absolute bottom-4 left-4 max-w-md border border-[var(--signal-major)] bg-[var(--bg)]/90 px-4 py-2 backdrop-blur">
              <p className="mono text-[10px] uppercase tracking-[0.25em] text-[var(--signal-major)]">Stage change</p>
              <p className="text-[13px] text-[var(--text)]">
                {projects.get(latestStageChange.project_id)?.name ?? "Project"} → {latestStageChange.stage.toUpperCase()} · confidence {latestStageChange.confidence.toFixed(2)}
              </p>
            </div>
          )}
        </div>
        <FeedRail feed={feed} projects={projects} onSelect={setSelectedId} />
      </div>
    </main>
  );
}
