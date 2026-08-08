import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ConfidenceMeter, KpiStat, RelativeTime, SeverityTag, SourceChip, StageBadge } from "./atoms";
import { STAGE_LADDER, SOURCE_LABELS, type Source, type Stage } from "@/lib/types";
import { stageHex } from "@/lib/theme";

const meta: Meta = { title: "Radar/Atoms" };
export default meta;

export const Foundations: StoryObj = {
  render: () => (
    <div style={{ display: "grid", gap: 12 }}>
      {(["bg", "bg-raise", "bg-panel", "accent", "signal-low", "signal-notable", "signal-major"] as const).map((t) => (
        <div key={t} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 28, height: 28, borderRadius: 4, background: `var(--${t})`, border: "1px solid var(--line-strong)" }} />
          <code className="mono" style={{ color: "var(--text-dim)", fontSize: 12 }}>--{t}</code>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        {STAGE_LADDER.map((s) => (
          <span key={s} title={s} style={{ width: 22, height: 22, borderRadius: 3, background: stageHex(s) }} />
        ))}
      </div>
    </div>
  ),
};

export const Stages: StoryObj = {
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxWidth: 420 }}>
      {([...STAGE_LADDER, "operational", "canceled", "unknown"] as Stage[]).map((s) => (
        <StageBadge key={s} stage={s} confidence={s === "fel2" ? 0.78 : undefined} />
      ))}
    </div>
  ),
};

export const Severities: StoryObj = {
  render: () => (
    <div style={{ display: "flex", gap: 16 }}>
      <SeverityTag severity="low" />
      <SeverityTag severity="notable" />
      <SeverityTag severity="major" />
    </div>
  ),
};

export const Sources: StoryObj = {
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxWidth: 420 }}>
      {(Object.keys(SOURCE_LABELS) as Source[]).map((s) => <SourceChip key={s} source={s} />)}
    </div>
  ),
};

export const Confidence: StoryObj = {
  render: () => (
    <div style={{ display: "grid", gap: 10 }}>
      <ConfidenceMeter value={0.31} />
      <ConfidenceMeter value={0.78} />
      <ConfidenceMeter value={0.95} />
    </div>
  ),
};

export const Kpis: StoryObj = {
  render: () => (
    <div style={{ display: "flex", gap: 32 }}>
      <KpiStat label="Projects tracked" value={57} />
      <KpiStat label="Pipeline" value="1,204" unit="MW" />
      <KpiStat label="Signals today" value={23} />
    </div>
  ),
};

export const Time: StoryObj = {
  render: () => <RelativeTime iso={new Date(Date.now() - 137_000).toISOString()} />,
};
