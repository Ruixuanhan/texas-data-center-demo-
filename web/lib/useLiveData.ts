"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { radarFetch } from "./api";
import type { Project, ProjectAlias, SourceEvent, StageHistoryRow } from "./types";

const FEED_LIMIT = 80;
const POLL_MS = 8_000;

export interface RadarSnapshot {
  generated_at: string;
  projects: Project[];
  events: SourceEvent[];
  stage_history: StageHistoryRow[];
  aliases: ProjectAlias[];
  match_candidates: Array<{
    id: string;
    left_project_id: string;
    right_project_id: string;
    score: number;
    decision: string;
    explanation: string;
    features: Record<string, number>;
  }>;
  ingestion_runs: Array<{
    id: string;
    source: string;
    status: string;
    records_seen: number;
    records_changed: number;
    completed_at: string | null;
    message: string | null;
  }>;
}

export interface LiveData {
  projects: Map<string, Project>;
  feed: SourceEvent[];
  stageHistory: StageHistoryRow[];
  aliases: ProjectAlias[];
  latestStageChange: StageHistoryRow | null;
  /** IDs whose evidence changed since the last refresh; this drives map pulses. */
  hot: Set<string>;
  connected: "polling" | "connecting" | "error";
  signalsToday: number;
  lastUpdated: string | null;
  error: string | null;
}

export function useLiveData(): LiveData {
  const [projects, setProjects] = useState<Map<string, Project>>(new Map());
  const [feed, setFeed] = useState<SourceEvent[]>([]);
  const [stageHistory, setStageHistory] = useState<StageHistoryRow[]>([]);
  const [aliases, setAliases] = useState<ProjectAlias[]>([]);
  const [latestStageChange, setLatestStageChange] = useState<StageHistoryRow | null>(null);
  const [hot, setHot] = useState<Set<string>>(new Set());
  const [connected, setConnected] = useState<LiveData["connected"]>("connecting");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seenEventIds = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const snapshot = await radarFetch<RadarSnapshot>("/api/v1/radar/snapshot");
      const rows = snapshot.events.slice(0, FEED_LIMIT);
      const fresh = rows.filter((row) => !seenEventIds.current.has(row.id));
      rows.forEach((row) => seenEventIds.current.add(row.id));

      setProjects(new Map(snapshot.projects.map((project) => [project.id, project])));
      setFeed(rows);
      setStageHistory(snapshot.stage_history);
      setAliases(snapshot.aliases);
      setLastUpdated(snapshot.generated_at);
      setError(null);
      setConnected("polling");

      const latest = snapshot.stage_history
        .filter((row) => row.stage && row.inferred_at)
        .sort((left, right) => right.inferred_at.localeCompare(left.inferred_at))[0] ?? null;
      setLatestStageChange(latest);

      if (!firstLoad.current && fresh.length) {
        const updatedIds = new Set(fresh.map((row) => row.project_id).filter((id): id is string => Boolean(id)));
        setHot(updatedIds);
        window.setTimeout(() => setHot(new Set()), 6_000);
      }
      firstLoad.current = false;
    } catch (reason) {
      setConnected("error");
      setError(reason instanceof Error ? reason.message : "Unable to reach the Project Radar API");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return {
    projects,
    feed,
    stageHistory,
    aliases,
    latestStageChange,
    hot,
    connected,
    signalsToday: feed.length,
    lastUpdated,
    error,
  };
}
