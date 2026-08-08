// Placeholder neutral-dark tokens — REPLACED by the winning direction's DESIGN.md values
// at the taste gate. Single TS source for values deck.gl needs as RGB arrays; the same
// values are exposed to CSS as custom properties in app/globals.css.
import type { Severity, Stage } from "./types";

export const STAGE_COLORS: Record<Stage, [number, number, number]> = {
  concept: [110, 168, 254],
  fel1: [92, 200, 226],
  fel2: [61, 218, 215],
  feed: [122, 226, 160],
  ia: [214, 222, 110],
  fid: [255, 180, 84],
  construction: [255, 137, 84],
  cod: [255, 255, 255],
  operational: [148, 163, 184],
  canceled: [71, 85, 105],
  unknown: [100, 116, 139],
};

export const SEVERITY_COLORS: Record<Severity, string> = {
  low: "var(--signal-low)",
  notable: "var(--signal-notable)",
  major: "var(--signal-major)",
};

export const stageHex = (s: Stage) =>
  `#${STAGE_COLORS[s].map((c) => c.toString(16).padStart(2, "0")).join("")}`;

// sRGB mirrors of the OKLCH deep scale for consumers that can't parse oklch()
// (MapLibre paint properties, GSAP color tweens). Source of truth: tokens/dataplanner.tokens.json.
export const WORLD = {
  water: "#17323f",
  land: "#26404f",
  park: "#23473f",
  background: "#223c4b",
  hillshadeShadow: "#0e1e29",
  hillshadeHighlight: "#4f6b80",
  hillshadeAccent: "#2b4456",
  roadMajor: "rgba(230,242,250,0.36)",
  roadMinor: "rgba(230,242,250,0.16)",
  boundary: "rgba(230,242,250,0.13)",
  countyLine: "rgba(230,242,250,0.10)",
  chromeHex: "#33495c",
} as const;
