"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useLiveData } from "@/lib/useLiveData";
import { computePairs, heatHex, heatScore } from "@/lib/heat";
import { STAGE_LABELS, STAGE_LADDER } from "@/lib/types";
import { HoverCard } from "@/components/HoverCard";
import { SignalTicker } from "@/components/SignalTicker";
import type { HoverInfo } from "@/components/MapCanvas";

const MapCanvas = dynamic(() => import("@/components/MapCanvas").then((m) => m.MapCanvas), { ssr: false });
const Dossier = dynamic(() => import("@/components/dossier/ProjectDossier").then((m) => m.ProjectDossier), { ssr: false });

function Kpi({ label, value, unit, hot }: { label: string; value: string | number; unit?: string; hot?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef<string | number>(value);
  useEffect(() => {
    if (prev.current !== value && ref.current) {
      gsap.fromTo(ref.current, { scale: 1.14, color: "#ffd8a8" }, { scale: 1, duration: 0.7, ease: "power3.out", clearProps: "color" });
    }
    prev.current = value;
  }, [value, hot]);
  return (
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-[0.22em] text-[var(--ink-faint)]">{label}</span>
      <span
        ref={ref}
        className="inline-block origin-left text-[30px] leading-none tracking-tight"
        style={{ fontFamily: "var(--font-display), Georgia, serif", fontWeight: 600, color: hot ? "var(--ember-ink)" : "var(--ink)" }}
      >
        {value}
        {unit && <span className="mono ml-1.5 text-[11px] font-normal tracking-normal text-[var(--ink-dim)]">{unit}</span>}
      </span>
    </div>
  );
}

export default function Home() {
  const { projects, feed, latestStageChange, hot, connected, signalsToday } = useLiveData();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const opsRef = useRef<HTMLElement>(null);

  const list = useMemo(() => [...projects.values()], [projects]);
  const dcList = useMemo(() => list.filter((p) => p.project_type !== "gas_to_power"), [list]);
  const totalMw = useMemo(() => Math.round(dcList.reduce((s, p) => s + (p.capacity_mw ?? 0), 0)), [dcList]);
  const earlyCount = useMemo(() => dcList.filter((p) => STAGE_LADDER.slice(0, 4).includes(p.current_stage)).length, [dcList]);
  const { pairs, pairedIds } = useMemo(() => computePairs(list), [list]);
  const topOps = useMemo(
    // The lens ranks DATA CENTERS — the load is the opportunity; gas is its pairing attribute.
    () => dcList.filter((p) => p.current_stage !== "canceled").map((p) => ({ p, h: heatScore(p, { paired: pairedIds.has(p.id) }) })).sort((a, b) => b.h - a.h).slice(0, 5),
    // heat decays with time; feed changes are the natural recompute pulse
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dcList, feed.length, pairedIds],
  );
  const selectedPair = useMemo(() => {
    if (!selectedId) return null;
    const pr = pairs.find((x) => x.dcId === selectedId || x.gasId === selectedId);
    if (!pr) return null;
    const otherId = pr.dcId === selectedId ? pr.gasId : pr.dcId;
    const other = projects.get(otherId);
    return other ? { other, km: pr.km } : null;
  }, [selectedId, pairs, projects]);

  // entrances are CSS (.intro-rise / .row-rise) — see globals.css; GSAP handles accents only

  return (
    <main className="flex flex-col" style={{ height: "100vh" }}>
      <header ref={headerRef} className="z-20 flex items-end gap-12 border-b border-[var(--border-subtle)] bg-[var(--surface-chrome)] px-6 pb-3 pt-3">
        <h1 data-intro className="intro-rise flex flex-col leading-none" style={{ animationDelay: "0.25s" }}>
          {/* wordmark: upright/italic contrast pair + ember full stop — one voice, one gesture */}
          <span className="whitespace-nowrap text-[23px] tracking-tight text-[var(--ink)]" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>
            <span style={{ fontWeight: 420 }}>Data</span>
            <span style={{ fontWeight: 700, fontStyle: "italic" }}> Planner</span>
            <span className="text-[var(--ember-ink)]" style={{ fontWeight: 700 }}>.</span>
          </span>
          <span className="mono mt-1 text-[8.5px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">energy capex · early warning</span>
        </h1>
        <div className="flex items-end gap-12">
          <div data-intro className="intro-rise" style={{ animationDelay: "0.35s" }}><Kpi label="Projects tracked" value={list.length} /></div>
          <div data-intro className="intro-rise" style={{ animationDelay: "0.44s" }}><Kpi label="DC load pipeline" value={totalMw.toLocaleString()} unit="MW" /></div>
          <div data-intro className="intro-rise" style={{ animationDelay: "0.53s" }}><Kpi label="Pre-FEED window" value={earlyCount} hot /></div>
          <div data-intro className="intro-rise" style={{ animationDelay: "0.62s" }}><Kpi label="BTM pairings" value={pairs.length} /></div>
          <div data-intro className="intro-rise" style={{ animationDelay: "0.71s" }}><Kpi label="Signals today" value={signalsToday} /></div>
        </div>
        <span data-intro style={{ animationDelay: "0.8s" }} className="intro-rise mono ml-auto flex items-center gap-2 pb-1 text-[10px] uppercase tracking-[0.25em] text-[var(--ink-dim)]">
          <span className={`live-dot inline-block h-1.5 w-1.5 rounded-full ${connected === "connecting" ? "bg-[var(--signal-notable)]" : "bg-[var(--ember-ink)]"}`} />
          {connected === "connecting" ? "connecting" : "live"}
        </span>
      </header>

      <div className="relative min-h-0 flex-1">
        <MapCanvas
          projects={list}
          projectIndex={projects}
          feed={feed}
          hot={hot}
          pairs={pairs}
          pairedIds={pairedIds}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onHover={setHover}
        />

        <HoverCard info={hover} />

        {/* Top opportunities — the investor lens, pinned to the theater */}
        {!selectedId && (
          <aside ref={opsRef} className="absolute bottom-14 left-6 z-10 w-[340px]" aria-label="Top opportunities">
            <h2 className="mb-2 flex items-baseline gap-2">
              <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic" }} className="text-[15px] text-[var(--text)]">
                Where the money should look
              </span>
              <span className="mono text-[8.5px] uppercase tracking-[0.25em] text-[var(--text-faint)]">live rank</span>
            </h2>
            <ol>
              {topOps.map(({ p, h }, i) => (
                <li key={p.id} data-ops-row className="row-rise" style={{ animationDelay: `${i * 0.07}s` }}>
                  <button
                    onClick={() => setSelectedId(p.id)}
                    className="group flex w-full items-center gap-3 border-t border-[var(--line)] py-2 text-left transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                  >
                    <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic" }} className="w-5 text-[17px] leading-none text-[var(--text-faint)] group-hover:text-[var(--text-dim)]">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] text-[var(--text)]">{p.name}</span>
                      <span className="mono block text-[9.5px] uppercase tracking-wider text-[var(--text-faint)]">
                        {p.county} Co · {p.capacity_mw ? `${Math.round(p.capacity_mw)} MW` : "— MW"} · {STAGE_LABELS[p.current_stage]}
                        {pairedIds.has(p.id) && <span className="text-[var(--signal-notable)]"> · btm</span>}
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
          <Dossier
            projectId={selectedId}
            project={projects.get(selectedId) ?? null}
            paired={selectedPair}
            onSelectProject={setSelectedId}
            onClose={() => setSelectedId(null)}
          />
        )}

        {latestStageChange && (
          <div key={latestStageChange.id} className="chyron-enter pointer-events-none absolute right-6 top-4 z-10 max-w-md border-l-2 border-[var(--signal-major)] bg-[var(--surface-overlay)] px-4 py-2.5 backdrop-blur">
            <p className="mono text-[9px] uppercase tracking-[0.3em] text-[var(--signal-major)]">Stage call</p>
            <p className="mt-0.5 text-[13px] leading-snug text-[var(--text)]">
              {projects.get(latestStageChange.project_id)?.name ?? "Project"} advances to {STAGE_LABELS[latestStageChange.stage]} · confidence {latestStageChange.confidence.toFixed(2)}
            </p>
          </div>
        )}

        {/* asset legend — paper chip, never the map's color */}
        <div className="mono pointer-events-none absolute bottom-14 right-6 z-10 flex items-center gap-5 border border-[var(--paper-line)] bg-[var(--paper)] px-3.5 py-2 text-[9px] uppercase tracking-[0.22em] text-[var(--ink-dim)] shadow-[0_10px_28px_rgba(10,15,22,0.4)]">
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[#d98a4d]" /> data center</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rotate-45 bg-[var(--ember-ink)]" /> gas-to-power</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-px w-5 bg-gradient-to-r from-[var(--ember-ink)] to-[#d98a4d]" /> btm pairing</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-1 bg-[var(--ink-faint)]" style={{ boxShadow: "3px 1px 0 var(--ink-dim), 6px 2px 0 var(--ember-ink)" }} /> stage steps</span>
        </div>

        <SignalTicker feed={feed} projects={projects} onSelect={setSelectedId} />
      </div>
    </main>
  );
}
