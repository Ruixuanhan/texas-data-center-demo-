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
