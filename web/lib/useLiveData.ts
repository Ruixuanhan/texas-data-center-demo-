"use client";
// Live data layer with TWO transports behind one interface:
//   1. Python Radar API (feature/project-radar-mvp backend) — set NEXT_PUBLIC_RADAR_API_URL
//      and the app polls its evidence snapshot (projects, events, stage history).
//   2. Supabase realtime (default) — postgres_changes subscriptions with an invisible
//      5s polling fallback (RLS/publication misconfig is the classic silent failure).
// The page consumes one shape either way; the demo never depends on which backend is up.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { RADAR_API_URL, radarFetch } from "./api";
import type { Project, ProjectAlias, SourceEvent, StageHistoryRow } from "./types";

const FEED_LIMIT = 80;
const API_POLL_MS = 8_000;

export interface RadarSnapshot {
  generated_at: string;
  projects: Project[];
  events: SourceEvent[];
  stage_history: StageHistoryRow[];
  aliases: ProjectAlias[];
}

export interface LiveData {
  projects: Map<string, Project>;
  feed: SourceEvent[];
  latestStageChange: StageHistoryRow | null;
  /** ids of projects that fired an event in the last few seconds (drives map pulses) */
  hot: Set<string>;
  connected: "realtime" | "polling" | "connecting";
  signalsToday: number;
}

export function useLiveData(): LiveData {
  const [projects, setProjects] = useState<Map<string, Project>>(new Map());
  const [feed, setFeed] = useState<SourceEvent[]>([]);
  const [latestStageChange, setLatestStageChange] = useState<StageHistoryRow | null>(null);
  const [hot, setHot] = useState<Set<string>>(new Set());
  const [connected, setConnected] = useState<LiveData["connected"]>("connecting");
  const [signalsToday, setSignalsToday] = useState(0);
  const seen = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);

  const markHot = (projectId: string | null) => {
    if (!projectId) return;
    setHot((prev) => new Set(prev).add(projectId));
    setTimeout(() => setHot((prev) => { const n = new Set(prev); n.delete(projectId); return n; }), 6000);
  };

  const ingestEvents = useCallback((rows: SourceEvent[], pulse: boolean) => {
    const fresh = rows.filter((r) => !seen.current.has(r.id));
    if (!fresh.length) return;
    fresh.forEach((r) => seen.current.add(r.id));
    setFeed((prev) => [...fresh, ...prev].sort((a, b) => b.ingested_at.localeCompare(a.ingested_at)).slice(0, FEED_LIMIT));
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    setSignalsToday((n) => n + fresh.filter((r) => new Date(r.ingested_at) >= midnight).length);
    if (pulse) fresh.forEach((r) => markHot(r.project_id));
  }, []);

  // ——— transport 1: the team's Python Radar API ———
  useEffect(() => {
    if (!RADAR_API_URL) return;
    let disposed = false;
    const refresh = async () => {
      try {
        const snap = await radarFetch<RadarSnapshot>("/api/v1/radar/snapshot");
        if (disposed) return;
        setProjects(new Map(snap.projects.map((p) => [p.id, p])));
        ingestEvents(snap.events.slice(0, FEED_LIMIT), !firstLoad.current);
        const latest = [...snap.stage_history].sort((a, b) => b.inferred_at.localeCompare(a.inferred_at))[0] ?? null;
        setLatestStageChange(latest);
        setConnected("polling");
        firstLoad.current = false;
      } catch { /* keep last good frame; next tick retries */ }
    };
    void refresh();
    const t = setInterval(() => void refresh(), API_POLL_MS);
    return () => { disposed = true; clearInterval(t); };
  }, [ingestEvents]);

  // ——— transport 2 (default): Supabase realtime + polling fallback ———
  useEffect(() => {
    if (RADAR_API_URL) return;
    const db = supabase();
    let disposed = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    (async () => {
      const [{ data: proj }, { data: events }] = await Promise.all([
        db.from("projects").select("*"),
        db.from("source_events").select("*").order("ingested_at", { ascending: false }).limit(FEED_LIMIT),
      ]);
      if (disposed) return;
      if (proj) setProjects(new Map(proj.map((p: Project) => [p.id, p])));
      if (events) {
        events.forEach((e: SourceEvent) => seen.current.add(e.id));
        setFeed(events as SourceEvent[]);
        const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
        setSignalsToday((events as SourceEvent[]).filter((r) => new Date(r.ingested_at) >= midnight).length);
      }
    })();

    const startPolling = () => {
      if (pollTimer) return;
      setConnected("polling");
      pollTimer = setInterval(async () => {
        const { data } = await db.from("source_events").select("*").order("ingested_at", { ascending: false }).limit(20);
        if (data) ingestEvents(data as SourceEvent[], true);
        const { data: proj } = await db.from("projects").select("*");
        if (proj) setProjects(new Map(proj.map((p: Project) => [p.id, p])));
      }, 5000);
    };

    const channel = db
      .channel("radar-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "source_events" }, (payload) => {
        ingestEvents([payload.new as SourceEvent], true);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "stage_history" }, (payload) => {
        setLatestStageChange(payload.new as StageHistoryRow);
        markHot((payload.new as StageHistoryRow).project_id);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, (payload) => {
        const p = payload.new as Project;
        if (p?.id) setProjects((prev) => new Map(prev).set(p.id, p));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnected("realtime");
          if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          startPolling();
        }
      });

    const guard = setTimeout(() => { if (!pollTimer) startPolling(); }, 8000);

    return () => {
      disposed = true;
      clearTimeout(guard);
      if (pollTimer) clearInterval(pollTimer);
      db.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingestEvents]);

  return { projects, feed, latestStageChange, hot, connected, signalsToday };
}
