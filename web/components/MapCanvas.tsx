"use client";
// The hero, v2 — textured typographic cartography with investor heat.
//   texture:    terrarium hillshade + county hairlines + tuned water/land inks + grain/vignette
//   matter:     MW as extruded columns (pitched camera), heat ramp = money temperature
//   typography: city + hot-project labels rendered as cartographic objects (deck TextLayer)
//   motion:     intro flight, pulse rings + filing arcs on live events, fly-to on select
import { useEffect, useRef } from "react";
import { Map as MapLibreMap, setWorkerUrl, type IControl } from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ScatterplotLayer, TextLayer, ArcLayer, ColumnLayer } from "@deck.gl/layers";
import type { Project, SourceEvent } from "@/lib/types";
import { heatColor, heatScore } from "@/lib/heat";
import "maplibre-gl/dist/maplibre-gl.css";

// Turbopack dev can't resolve maplibre's module-worker URL; serve the dist worker statically.
setWorkerUrl("/maplibre-gl-worker.mjs");

const BASEMAP = "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json";
const HOME = { center: [-99.0, 31.1] as [number, number], zoom: 5.55, pitch: 44, bearing: -9 };

const CITIES: { name: string; pos: [number, number]; major?: boolean }[] = [
  { name: "Dallas", pos: [-96.797, 32.777], major: true },
  { name: "Fort Worth", pos: [-97.33, 32.755] },
  { name: "Houston", pos: [-95.367, 29.76], major: true },
  { name: "Austin", pos: [-97.743, 30.267], major: true },
  { name: "San Antonio", pos: [-98.493, 29.424], major: true },
  { name: "El Paso", pos: [-106.485, 31.759] },
  { name: "Midland", pos: [-102.077, 31.997] },
  { name: "Lubbock", pos: [-101.855, 33.577] },
  { name: "Amarillo", pos: [-101.831, 35.19] },
  { name: "Corpus Christi", pos: [-97.396, 27.8] },
];

// Where a filing "comes from" — the arc's origin.
const AGENCY: Record<string, [number, number]> = {
  puct: [-97.743, 30.267], tceq: [-97.743, 30.267], rrc: [-97.743, 30.267],
  ercot_gis: [-97.743, 30.267], ercot_rioo: [-97.743, 30.267], ercot_mora: [-97.743, 30.267],
  ferc: [-77.036, 38.907],
  press: [-95.367, 29.76], earnings: [-95.367, 29.76], oem_epc: [-95.367, 29.76],
};
const METROS: [number, number][] = [[-96.797, 32.777], [-95.367, 29.76], [-97.743, 30.267], [-98.493, 29.424], [-106.485, 31.759]];
const arcOrigin = (e: SourceEvent, p: Project): [number, number] => {
  const a = AGENCY[e.source];
  if (a) return a;
  let best = METROS[0], bd = Infinity;
  for (const m of METROS) {
    const d = (m[0] - (p.lon ?? -99)) ** 2 + (m[1] - (p.lat ?? 31)) ** 2;
    if (d > 0.02 && d < bd) { bd = d; best = m; }
  }
  return best;
};

interface LiveArc { id: string; event: SourceEvent; project: Project; bornAt: number }
const ARC_TTL = 8000;

export function MapCanvas({
  projects,
  projectIndex,
  feed,
  hot,
  selectedId,
  onSelect,
}: {
  projects: Project[];
  projectIndex: Map<string, Project>;
  feed: SourceEvent[];
  hot: Set<string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const frameRef = useRef<number>(0);
  const arcsRef = useRef<LiveArc[]>([]);
  const arcSeen = useRef<Set<string>>(new Set());
  const stateRef = useRef({ projects, projectIndex, feed, hot, selectedId });
  stateRef.current = { projects, projectIndex, feed, hot, selectedId };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: BASEMAP,
      center: [-98.5, 30.6],
      zoom: 4.3,
      pitch: 0,
      bearing: 0,
      attributionControl: { compact: true },
      maxPitch: 60,
    });
    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(overlay as unknown as IControl);
    mapRef.current = map;

    map.on("load", () => {
      // ——— texture: tuned inks ———
      try {
        for (const layer of map.getStyle().layers ?? []) {
          if (layer.type === "background") map.setPaintProperty(layer.id, "background-color", "#0a0e13");
          if (layer.type === "fill" && /water|ocean/i.test(layer.id)) map.setPaintProperty(layer.id, "fill-color", "#060a10");
          if (layer.type === "fill" && /land/i.test(layer.id)) map.setPaintProperty(layer.id, "fill-color", "#10161e");
        }
      } catch { /* basemap ids shift between versions; tint is best-effort */ }

      // ——— texture: hillshade from open terrarium DEM (no key) ———
      map.addSource("dem", {
        type: "raster-dem",
        tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 12,
        attribution: "Terrain: Mapzen/AWS",
      });
      map.addLayer({
        id: "hillshade",
        type: "hillshade",
        source: "dem",
        paint: {
          "hillshade-exaggeration": 0.8,
          "hillshade-shadow-color": "#04070b",
          "hillshade-highlight-color": "#2a3646",
          "hillshade-accent-color": "#141c26",
        },
      });

      // ——— texture: county hairlines ———
      map.addSource("counties", { type: "geojson", data: "/tx-counties.json" });
      map.addLayer({
        id: "county-lines",
        type: "line",
        source: "counties",
        paint: {
          "line-color": "rgba(214,196,161,0.10)",
          "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.3, 8, 0.9],
        },
      });

      // ——— intro flight ———
      map.flyTo({ ...HOME, duration: 3200, essential: true });
    });

    const render = (now: number) => {
      const { projects, projectIndex, feed, hot, selectedId } = stateRef.current;
      const placed = projects.filter((p) => p.lat != null && p.lon != null);
      const t = (now % 2200) / 2200;
      const scored = placed.map((p) => ({ p, h: heatScore(p) }));
      const topHot = [...scored].sort((a, b) => b.h - a.h).slice(0, 5).map((d, i) => ({ ...d, rank: i }));

      // arc lifecycle: fresh attributed events spawn an arc, arcs die after ARC_TTL
      for (const e of feed.slice(0, 20)) {
        if (arcSeen.current.has(e.id) || !e.project_id) continue;
        const project = projectIndex.get(e.project_id);
        if (!project || project.lon == null) continue;
        if (Date.now() - new Date(e.ingested_at).getTime() > 15000) { arcSeen.current.add(e.id); continue; }
        arcSeen.current.add(e.id);
        arcsRef.current.push({ id: e.id, event: e, project, bornAt: now });
      }
      arcsRef.current = arcsRef.current.filter((a) => now - a.bornAt < ARC_TTL);
      const arcs = arcsRef.current;

      overlay.setProps({
        layers: [
          // filing arcs — a document flying from its agency to the site
          new ArcLayer<LiveArc>({
            id: "arcs",
            data: arcs,
            getSourcePosition: (a) => arcOrigin(a.event, a.project),
            getTargetPosition: (a) => [a.project.lon!, a.project.lat!],
            getSourceColor: (a) => [255, 216, 168, Math.round(Math.max(0, 200 * (1 - (now - a.bornAt) / ARC_TTL)))] as never,
            getTargetColor: (a) => [...heatColor(heatScore(a.project)), Math.round(Math.max(0, 240 * (1 - (now - a.bornAt) / ARC_TTL)))] as never,
            getWidth: 1.6,
            getHeight: 0.6,
            greatCircle: false,
            updateTriggers: { getSourceColor: now, getTargetColor: now },
          }),
          // pulse rings on live signals
          new ScatterplotLayer({
            id: "pulse",
            data: scored.filter(({ p }) => hot.has(p.id)),
            getPosition: ({ p }) => [p.lon!, p.lat!],
            getRadius: () => 5000 + t * 30000,
            getLineColor: ({ p, h }) => [...heatColor(h), Math.round(210 * (1 - t))] as never,
            stroked: true,
            filled: false,
            lineWidthMinPixels: 1.5,
            radiusUnits: "meters",
            updateTriggers: { getRadius: t, getLineColor: t },
          }),
          // MW as matter — extruded columns, heat-colored
          new ColumnLayer({
            id: "columns",
            data: scored,
            pickable: true,
            diskResolution: 12,
            radius: 5200,
            extruded: true,
            getPosition: ({ p }) => [p.lon!, p.lat!],
            getElevation: ({ p }) => 2500 + Math.sqrt(p.capacity_mw ?? 6) * 3400,
            getFillColor: ({ p, h }) => {
              const c = heatColor(h);
              const boost = p.id === selectedId ? 255 : hot.has(p.id) ? 245 : 205;
              return [c[0], c[1], c[2], boost] as never;
            },
            getLineColor: [10, 14, 19, 255],
            onClick: (info) => onSelect(info.object ? (info.object as { p: Project }).p.id : null),
            updateTriggers: { getFillColor: [selectedId, hot] },
            transitions: { getElevation: { duration: 900, easing: (x: number) => 1 - (1 - x) ** 3 } },
          }),
          // ground dot anchors the column and survives flat pitch
          new ScatterplotLayer({
            id: "anchors",
            data: scored,
            pickable: true,
            getPosition: ({ p }) => [p.lon!, p.lat!],
            getRadius: ({ p }) => 1800 + Math.sqrt(p.capacity_mw ?? 6) * 900,
            radiusMinPixels: 2.5,
            radiusMaxPixels: 14,
            getFillColor: ({ p, h }) => [...heatColor(h), p.id === selectedId ? 255 : 190] as never,
            getLineColor: ({ p }) => (p.id === selectedId ? [255, 250, 240, 255] : [8, 11, 15, 220]) as never,
            getLineWidth: ({ p }) => (p.id === selectedId ? 2.2 : 1),
            lineWidthUnits: "pixels",
            stroked: true,
            onClick: (info) => onSelect(info.object ? (info.object as { p: Project }).p.id : null),
            updateTriggers: { getFillColor: [selectedId], getLineColor: selectedId, getLineWidth: selectedId },
          }),
          // typographic map: cities as editorial objects
          new TextLayer({
            id: "city-labels",
            data: CITIES,
            getPosition: (c) => c.pos,
            getText: (c) => c.name.toUpperCase(),
            getSize: (c) => (c.major ? 15 : 11.5),
            getColor: (c) => (c.major ? [216, 205, 189, 165] : [173, 166, 155, 110]),
            fontFamily: '"Fraunces", Georgia, "Times New Roman", serif',
            fontWeight: 500,
            getTextAnchor: "start",
            getAlignmentBaseline: "center",
            getPixelOffset: [10, 0],
            outlineWidth: 3,
            outlineColor: [7, 10, 14, 235],
            fontSettings: { sdf: true },
          }),
          // hottest projects earn their names on the map
          new TextLayer({
            id: "project-labels",
            data: topHot,
            getPosition: ({ p }) => [p.lon!, p.lat!],
            getText: ({ p }) => `${p.name.length > 26 ? p.name.slice(0, 24) + "…" : p.name}  ·  ${p.capacity_mw ? Math.round(p.capacity_mw) + " MW" : "— MW"}`,
            getSize: 11,
            getColor: ({ h }) => [...heatColor(Math.max(h, 0.5)), 235] as never,
            fontFamily: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
            fontWeight: 500,
            getTextAnchor: "start",
            getAlignmentBaseline: "bottom",
            // stagger labels so clustered metros (DFW) don't pile up
            getPixelOffset: (d: { rank: number }) => [10 + (d.rank % 2) * 6, -12 - d.rank * 13],
            outlineWidth: 4,
            outlineColor: [7, 10, 14, 245],
            fontSettings: { sdf: true },
          }),
        ],
      });
      frameRef.current = requestAnimationFrame(render);
    };
    frameRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frameRef.current);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // cinematic fly-to on selection
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const p = projects.find((x) => x.id === selectedId);
    if (p?.lat != null && p?.lon != null) {
      map.flyTo({ center: [p.lon + 0.45, p.lat - 0.08], zoom: 8.0, pitch: 52, bearing: -18, speed: 0.85, curve: 1.5, essential: true });
    } else return;
    return () => {};
  }, [selectedId, projects]);

  // release camera back to the state view when dossier closes
  const hadSelection = useRef(false);
  useEffect(() => {
    if (selectedId) { hadSelection.current = true; return; }
    if (hadSelection.current && mapRef.current) {
      mapRef.current.flyTo({ ...HOME, duration: 2200, essential: true });
    }
  }, [selectedId]);

  return (
    <div style={{ position: "absolute", inset: 0 }} role="application" aria-label="Texas project map">
      {/* maplibre-gl.css sets .maplibregl-map{position:relative} which beats the Tailwind
          class (later import, same specificity) — inline styles win, hence this wrapper. */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      {/* texture: grain + vignette above tiles, below UI */}
      <div aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(120% 95% at 46% 42%, transparent 52%, rgba(3,5,8,0.62) 100%)",
      }} />
      <div aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.05, mixBlendMode: "overlay",
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.7'/%3E%3C/svg%3E\")",
      }} />
    </div>
  );
}
