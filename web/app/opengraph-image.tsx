import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Radar/TX — live energy capex intelligence";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0a0e13",
          padding: 64,
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 16, height: 16, borderRadius: 999, background: "#ffd8a8" }} />
          <div style={{ color: "#9a958a", fontSize: 26, letterSpacing: 8, textTransform: "uppercase" }}>
            Live · Texas energy capex
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ color: "#e9e4da", fontSize: 120, fontStyle: "italic", fontWeight: 700, lineHeight: 1 }}>
            Radar<span style={{ color: "#ffb454" }}>/</span>TX
          </div>
          <div style={{ color: "#9a958a", fontSize: 34, lineHeight: 1.35, maxWidth: 900 }}>
            Every queue filing, permit, docket, and county agenda — one addictive, self-updating map.
          </div>
        </div>
        <div style={{ display: "flex", gap: 28, color: "#5f5c54", fontSize: 22, letterSpacing: 4, textTransform: "uppercase" }}>
          <span>ERCOT</span><span>PUCT</span><span>TCEQ</span><span>FERC</span><span>RRC</span><span>County</span><span>Press</span>
          <span style={{ marginLeft: "auto", color: "#ffb454" }}>concept → COD</span>
        </div>
      </div>
    ),
    size,
  );
}
