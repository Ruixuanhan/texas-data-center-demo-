// Mirrors the Python FastAPI evidence snapshot — the frozen web data contract.
export type Stage =
  | "concept" | "fel1" | "fel2" | "feed" | "ia" | "fid"
  | "construction" | "cod" | "operational" | "canceled" | "unknown";

export type Severity = "low" | "notable" | "major";

export type Source =
  | "ercot_gis" | "ercot_rioo" | "ercot_mora" | "puct" | "ferc" | "tceq" | "rrc"
  | "county" | "municipal" | "press" | "earnings" | "oem_epc" | "cleanview" | "simulator" | "manual";

export interface Project {
  id: string;
  slug: string;
  name: string;
  developer: string | null;
  city: string | null;
  county: string | null;
  lat: number | null;
  lon: number | null;
  capacity_mw: number | null;
  project_type: string | null;
  power_type: string | null;
  current_stage: Stage;
  stage_confidence: number | null;
  headline: string | null;
  first_seen: string | null;
  last_activity: string | null;
}

export interface SourceEvent {
  id: string;
  project_id: string | null;
  source: Source;
  event_type: string | null;
  title: string;
  summary: string | null;
  url: string | null;
  severity: Severity;
  occurred_at: string | null;
  ingested_at: string;
}

export interface StageHistoryRow {
  id: string;
  project_id: string;
  stage: Stage;
  confidence: number;
  rationale: string | null;
  evidence_event_ids: string[] | null;
  inferred_by: "rules" | "llm" | "human" | null;
  inferred_at: string;
}

export interface ProjectAlias {
  id: string;
  project_id: string;
  alias: string;
  alias_type: "llc" | "permit_name" | "queue_name" | "docket_name" | "press_name" | "other" | null;
  confidence: number | null;
  source: string | null;
}

export const STAGE_LADDER: Stage[] = ["concept", "fel1", "fel2", "feed", "ia", "fid", "construction", "cod"];

export const STAGE_LABELS: Record<Stage, string> = {
  concept: "Concept",
  fel1: "FEL-1",
  fel2: "FEL-2 / Pre-FEED",
  feed: "FEED",
  ia: "Interconnection",
  fid: "FID",
  construction: "Construction",
  cod: "COD",
  operational: "Operational",
  canceled: "Canceled",
  unknown: "Unknown",
};

export const SOURCE_LABELS: Record<Source, string> = {
  ercot_gis: "ERCOT GIS",
  ercot_rioo: "ERCOT RIOO",
  ercot_mora: "ERCOT MORA",
  puct: "PUCT",
  ferc: "FERC",
  tceq: "TCEQ",
  rrc: "RRC",
  county: "County",
  municipal: "Municipal",
  press: "Press",
  earnings: "Earnings",
  oem_epc: "OEM/EPC",
  cleanview: "Cleanview",
  simulator: "Wire",
  manual: "Desk",
};
