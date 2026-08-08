import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Data Planner — live energy capex intelligence";

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
          background: "#ece5d6",
          padding: 64,
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 14, height: 14, borderRadius: 999, background: "#b95f24" }} />
            <div style={{ color: "rgba(29,35,46,0.6)", fontSize: 24, letterSpacing: 7, textTransform: "uppercase" }}>
              Live · energy capex · early warning
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {[26, 40, 54, 68, 82].map((h, i) => (
              <div key={i} style={{ width: 18, height: h, background: i < 3 ? "#1d232e" : "#b95f24", alignSelf: "flex-end" }} />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", color: "#1d232e", fontSize: 124, lineHeight: 1, alignItems: "baseline" }}>
            <span style={{ fontWeight: 400 }}>Data</span>
            <span style={{ fontWeight: 700, fontStyle: "italic", marginLeft: 26 }}>Planner</span>
            <span style={{ fontWeight: 700, color: "#b95f24" }}>.</span>
          </div>
          <div style={{ color: "rgba(29,35,46,0.65)", fontSize: 33, lineHeight: 1.35, maxWidth: 940 }}>
            Data centers and the gas that powers them — every queue filing, permit, and county agenda on one living map.
          </div>
        </div>
        <div style={{ display: "flex", gap: 26, color: "rgba(29,35,46,0.45)", fontSize: 21, letterSpacing: 4, textTransform: "uppercase" }}>
          <span>ERCOT</span><span>PUCT</span><span>TCEQ</span><span>FERC</span><span>RRC</span><span>County</span><span>Press</span>
          <span style={{ marginLeft: "auto", color: "#b95f24" }}>concept → COD</span>
        </div>
      </div>
    ),
    size,
  );
}
