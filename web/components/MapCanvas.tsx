"use client";
// The hero, v3 — la-phase-5 material language on live data.
//   world:      deep slate-blue terrain, white hairline streets, peach building mass on fly-in
//   matter:     projects as lit monomaterial volumes — DC cylinders, gas 4-sided obelisks
//   lens:       heat ramp (slate → clay → peach → ember) + DC↔gas pairing tethers
//   typography: serif cities + spaced region names as cartographic objects
//   motion:     intro flight, pulses, filing arcs, deep fly-in to street level on select
import { useEffect, useRef } from "react";
import { Map as MapLibreMap, setWorkerUrl, type IControl } from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { AmbientLight, DirectionalLight, LightingEffect } from "@deck.gl/core";
import { ScatterplotLayer, TextLayer, ArcLayer, PolygonLayer } from "@deck.gl/layers";
import type { Project, SourceEvent } from "@/lib/types";
import { heatColor, heatScore, type Pair } from "@/lib/heat";
import { buildCampus, builtOpacity, campusScale, type CampusBlock } from "@/lib/campus";
import "maplibre-gl/dist/maplibre-gl.css";

// Turbopack dev can't resolve maplibre's module-worker URL; serve the dist worker statically.
setWorkerUrl("/maplibre-gl-worker.mjs");

const BASEMAP = "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json";
const HOME = { center: [-99.0, 31.1] as [number, number], zoom: 5.55, pitch: 44, bearing: -9 };

// One warm key light from the north-west, like the reference diorama.
const LIGHTING = new LightingEffect({
  ambient: new AmbientLight({ color: [226, 232, 244], intensity: 1.15 }),
  key: new DirectionalLight({ color: [255, 226, 196], intensity: 1.5, direction: [-2, -3, -1.2] }),
});
const MATERIAL = { ambient: 0.5, diffuse: 0.75, shininess: 90, specularColor: [255, 224, 190] as [number, number, number] };

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

const REGIONS: { name: string; pos: [number, number]; size: number }[] = [
  { name: "GULF OF MEXICO", pos: [-95.6, 27.35], size: 15 },
  { name: "PERMIAN BASIN", pos: [-102.7, 31.55], size: 12 },
  { name: "HILL COUNTRY", pos: [-99.35, 30.25], size: 11 },
  { name: "EAST TEXAS", pos: [-94.95, 31.9], size: 11 },
  { name: "PANHANDLE", pos: [-101.45, 35.35], size: 11 },
];
const spaced = (s: string) => s.split("").join(" ").replace(/   /g, "   ");

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

export interface HoverInfo { project: Project; heat: number; x: number; y: number }

export function MapCanvas({
  projects,
  projectIndex,
  feed,
  hot,
  pairs,
  pairedIds,
  selectedId,
  onSelect,
  onHover,
}: {
  projects: Project[];
  projectIndex: Map<string, Project>;
  feed: SourceEvent[];
  hot: Set<string>;
  pairs: Pair[];
  pairedIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onHover?: (info: HoverInfo | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const frameRef = useRef<number>(0);
  const arcsRef = useRef<LiveArc[]>([]);
  const arcSeen = useRef<Set<string>>(new Set());
  const countyWashRef = useRef<(() => void) | null>(null);
  const stateRef = useRef({ projects, projectIndex, feed, hot, pairs, pairedIds, selectedId });
  stateRef.current = { projects, projectIndex, feed, hot, pairs, pairedIds, selectedId };

  // data-driven county warmth: counties glow faintly with the MW they carry
  useEffect(() => {
    const apply = () => {
      const map = mapRef.current;
      if (!map || !map.getLayer("county-heat")) return;
      const mwByCounty = new Map<string, number>();
      for (const p of projects) {
        if (!p.county) continue;
        mwByCounty.set(p.county, (mwByCounty.get(p.county) ?? 0) + (p.capacity_mw ?? 20));
      }
      if (mwByCounty.size === 0) return;
      const expr: unknown[] = ["match", ["get", "NAME"]];
      for (const [county, mw] of mwByCounty) expr.push(county, +(0.035 + Math.min(0.1, (mw / 600) * 0.1)).toFixed(3));
      expr.push(0);
      map.setPaintProperty("county-heat", "fill-opacity", expr as never);
    };
    countyWashRef.current = apply;
    apply();
  }, [projects]);

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
      maxPitch: 62,
    });
    const overlay = new MapboxOverlay({ interleaved: false, layers: [], effects: [LIGHTING] });
    map.addControl(overlay as unknown as IControl);
    mapRef.current = map;

    map.on("load", () => {
      // ——— world re-ink: dusk chroma — teal water, warm-slate land, sage green space ———
      try {
        for (const layer of map.getStyle().layers ?? []) {
          if (layer.type === "background") map.setPaintProperty(layer.id, "background-color", "#182230");
          if (layer.type === "fill" && /water|ocean/i.test(layer.id)) map.setPaintProperty(layer.id, "fill-color", "#0f2230");
          else if (layer.type === "fill" && /park|green|wood|grass/i.test(layer.id)) map.setPaintProperty(layer.id, "fill-color", "#22332f");
          else if (layer.type === "fill" && /land|residential/i.test(layer.id)) map.setPaintProperty(layer.id, "fill-color", "#26303a");
          if (layer.type === "line") {
            const road = /road|street|highway|motorway|trunk|primary|secondary|tertiary|minor|path|rail|transit/i.test(layer.id);
            const boundary = /admin|boundary|border/i.test(layer.id);
            if (road) {
              const majorRoad = /motorway|trunk|highway|primary/i.test(layer.id);
              map.setPaintProperty(layer.id, "line-color", majorRoad ? "rgba(226,234,246,0.34)" : "rgba(226,234,246,0.15)");
            } else if (boundary) {
              map.setPaintProperty(layer.id, "line-color", "rgba(226,234,246,0.12)");
            }
          }
        }
      } catch { /* basemap ids shift between versions; re-ink is best-effort */ }

      // ——— terrain relief, tuned to slate ———
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
          "hillshade-exaggeration": 0.75,
          "hillshade-shadow-color": "#0c1520",
          "hillshade-highlight-color": "#46536b",
          "hillshade-accent-color": "#2a3242",
        },
      });

      // ——— counties: activity wash (data-driven warmth) under hairlines ———
      map.addSource("counties", { type: "geojson", data: "/tx-counties.json" });
      map.addLayer({
        id: "county-heat",
        type: "fill",
        source: "counties",
        paint: { "fill-color": "#f2c49b", "fill-opacity": 0 },
      });
      map.addLayer({
        id: "county-lines",
        type: "line",
        source: "counties",
        paint: {
          "line-color": "rgba(226,234,246,0.09)",
          "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.3, 8, 0.9],
        },
      });
      countyWashRef.current?.(); // apply wash if projects already arrived

      // NOTE: no generic building/landuse extrusions — the only 3D matter on this map
      // is the tracked assets themselves (data-center halls, plant stacks). Geography stays flat.

      map.flyTo({ ...HOME, duration: 3200, essential: true });
    });

    const render = (now: number) => {
      const { projects, projectIndex, feed, hot, pairs, pairedIds, selectedId } = stateRef.current;
      const placed = projects.filter((p) => p.lat != null && p.lon != null);
      const t = (now % 2200) / 2200;
      const scored = placed.map((p) => ({ p, h: heatScore(p, { paired: pairedIds.has(p.id) }) }));
      const dcs = scored.filter(({ p }) => p.project_type !== "gas_to_power");
      const gas = scored.filter(({ p }) => p.project_type === "gas_to_power");
      const topHot = [...dcs].sort((a, b) => b.h - a.h).slice(0, 5).map((d, i) => ({ ...d, rank: i }));
      const tethers = pairs
        .map((pr) => ({ pr, dc: projectIndex.get(pr.dcId), g: projectIndex.get(pr.gasId) }))
        .filter((x) => x.dc?.lon != null && x.g?.lon != null);

      for (const e of feed.slice(0, 20)) {
        if (arcSeen.current.has(e.id) || !e.project_id) continue;
        const project = projectIndex.get(e.project_id);
        if (!project || project.lon == null) continue;
        if (Date.now() - new Date(e.ingested_at).getTime() > 15000) { arcSeen.current.add(e.id); continue; }
        arcSeen.current.add(e.id);
        arcsRef.current.push({ id: e.id, event: e, project, bornAt: now });
      }
      arcsRef.current = arcsRef.current.filter((a) => now - a.bornAt < ARC_TTL);

      // asset architecture: campuses regenerate as the camera zooms (sculptural far, true-scale near)
      const scale = campusScale(map.getZoom());
      const campusData: Array<{ p: Project; h: number; block: CampusBlock }> = [];
      for (const s of scored) for (const block of buildCampus(s.p, scale)) campusData.push({ p: s.p, h: s.h, block });

      overlay.setProps({
        layers: [
          // pairing tethers — the behind-the-meter story drawn as low power lines
          new ArcLayer({
            id: "tethers",
            data: tethers,
            getSourcePosition: (d) => [d.g!.lon!, d.g!.lat!],
            getTargetPosition: (d) => [d.dc!.lon!, d.dc!.lat!],
            getSourceColor: [255, 161, 99, 210],
            getTargetColor: [242, 196, 155, 235],
            getWidth: 2,
            getHeight: 0.9,
          }),
          // filing arcs — a document flying from its agency to the site
          new ArcLayer<LiveArc>({
            id: "arcs",
            data: arcsRef.current,
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
            getLineColor: ({ h }) => [...heatColor(h), Math.round(210 * (1 - t))] as never,
            stroked: true,
            filled: false,
            lineWidthMinPixels: 1.5,
            radiusUnits: "meters",
            updateTriggers: { getRadius: t, getLineColor: t },
          }),
          // the assets themselves as sculpted matter — server halls, stacks, switchyards
          new PolygonLayer<{ p: Project; h: number; block: CampusBlock }>({
            id: "campuses",
            data: campusData,
            pickable: true,
            extruded: true,
            material: MATERIAL,
            autoHighlight: true,
            highlightColor: [255, 242, 224, 70],
            getPolygon: (d) => d.block.polygon,
            getElevation: (d) => d.block.height * Math.max(1, scale * 0.85),
            getFillColor: (d) => {
              const c = heatColor(d.block.kind === "stack" ? Math.min(1, d.h + 0.12) : d.h);
              const alpha = d.p.id === selectedId ? 250 : builtOpacity(d.p);
              return [c[0], c[1], c[2], alpha] as [number, number, number, number];
            },
            getLineColor: [16, 24, 34, 255],
            getLineWidth: 1,
            lineWidthUnits: "pixels",
            stroked: false,
            onClick: (info) => onSelect(info.object ? info.object.p.id : null),
            onHover: (info) =>
              onHover?.(info.object ? { project: info.object.p, heat: info.object.h, x: info.x, y: info.y } : null),
            updateTriggers: { getPolygon: scale, getElevation: scale, getFillColor: [selectedId, scale] },
          }),
          // ground anchors (readability at flat angles + generous click target)
          new ScatterplotLayer({
            id: "anchors",
            data: scored,
            pickable: true,
            getPosition: ({ p }) => [p.lon!, p.lat!],
            getRadius: ({ p }) => 1800 + Math.sqrt(p.capacity_mw ?? 6) * 900,
            radiusMinPixels: 2.5,
            radiusMaxPixels: 14,
            getFillColor: ({ p, h }) => [...heatColor(h), p.id === selectedId ? 255 : 170] as never,
            getLineColor: ({ p }) => (p.id === selectedId ? [255, 250, 240, 255] : [12, 17, 24, 220]) as never,
            getLineWidth: ({ p }) => (p.id === selectedId ? 2.2 : 1),
            lineWidthUnits: "pixels",
            stroked: true,
            onClick: (info) => onSelect(info.object ? (info.object as { p: Project }).p.id : null),
            onHover: (info) => onHover?.(info.object ? { project: (info.object as { p: Project; h: number }).p, heat: (info.object as { p: Project; h: number }).h, x: info.x, y: info.y } : null),
            updateTriggers: { getFillColor: [selectedId], getLineColor: selectedId, getLineWidth: selectedId },
          }),
          // regions — quiet spaced caps, the cartographic undertone
          new TextLayer({
            id: "region-labels",
            data: REGIONS,
            getPosition: (r) => r.pos,
            getText: (r) => spaced(r.name),
            getSize: (r) => r.size,
            getColor: [196, 208, 226, 78],
            fontFamily: '"Fraunces", Georgia, "Times New Roman", serif',
            fontWeight: 400,
            outlineWidth: 2,
            outlineColor: [10, 15, 22, 200],
            fontSettings: { sdf: true },
          }),
          // cities — editorial serif objects
          new TextLayer({
            id: "city-labels",
            data: CITIES,
            getPosition: (c) => c.pos,
            getText: (c) => c.name.toUpperCase(),
            getSize: (c) => (c.major ? 15 : 11.5),
            getColor: (c) => (c.major ? [226, 220, 208, 175] : [186, 182, 172, 115]),
            fontFamily: '"Fraunces", Georgia, "Times New Roman", serif',
            fontWeight: 500,
            getTextAnchor: "start",
            getAlignmentBaseline: "center",
            getPixelOffset: [10, 0],
            outlineWidth: 3,
            outlineColor: [10, 15, 22, 235],
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
            outlineColor: [10, 15, 22, 245],
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

  // deep cinematic fly-in on selection — street level, buildings rise
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const p = projects.find((x) => x.id === selectedId);
    if (p?.lat != null && p?.lon != null) {
      map.flyTo({
        center: [p.lon, p.lat],
        zoom: 12.6,
        pitch: 56,
        bearing: -22,
        speed: 0.8,
        curve: 1.55,
        padding: { left: 500, top: 0, right: 0, bottom: 0 },
        essential: true,
      });
    }
  }, [selectedId, projects]);

  // release camera back to the state view when dossier closes
  const hadSelection = useRef(false);
  useEffect(() => {
    if (selectedId) { hadSelection.current = true; return; }
    if (hadSelection.current && mapRef.current) {
      mapRef.current.flyTo({ ...HOME, padding: { left: 0, top: 0, right: 0, bottom: 0 }, duration: 2400, essential: true });
    }
  }, [selectedId]);

  return (
    <div style={{ position: "absolute", inset: 0 }} role="application" aria-label="Texas project map">
      {/* maplibre-gl.css sets .maplibregl-map{position:relative} which beats the Tailwind
          class (later import, same specificity) — inline styles win, hence this wrapper. */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      {/* texture: dusk sky wash + grain + vignette above tiles, below UI */}
      <div aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "linear-gradient(180deg, rgba(96,88,138,0.12) 0%, rgba(255,154,90,0.055) 20%, transparent 44%)",
      }} />
      <div aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(120% 95% at 46% 42%, transparent 52%, rgba(8,12,18,0.6) 100%)",
      }} />
      <div aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.05, mixBlendMode: "overlay",
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.7'/%3E%3C/svg%3E\")",
      }} />
    </div>
  );
}
