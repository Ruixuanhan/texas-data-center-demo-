"use client";
// The hero, v4 — the la-phase-5 diorama read, honestly this time:
//   world:      FLAT designed land (no imagery, no relief) — dark slate ground, darker water,
//               BRIGHT grid linework; Texas fills the frame
//   assets:     prefab GLB buildings (data-center campus / gas plant) at landmark scale,
//               heat-tinted, crowd-aware; procedural blocks remain only as a fallback
//               until the models load
//   progress:   fused INTO each asset — a beam of light rising from the building,
//               height = how far up the FEL ladder the project has climbed
//   motion:     intro flight, pulses, filing arcs, BTM tethers, deep fly-in on select
import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, setWorkerUrl, type IControl } from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { AmbientLight, DirectionalLight, LightingEffect } from "@deck.gl/core";
import { ScatterplotLayer, TextLayer, ArcLayer, ColumnLayer, PolygonLayer } from "@deck.gl/layers";
import { ScenegraphLayer } from "@deck.gl/mesh-layers";
import { GLTFLoader } from "@loaders.gl/gltf";
import type { Project, SourceEvent } from "@/lib/types";
import { STAGE_LADDER } from "@/lib/types";
import { heatColor, heatScore, type Pair } from "@/lib/heat";
import { buildCampus, type CampusBlock } from "@/lib/campus";
import { WORLD } from "@/lib/theme";
import "maplibre-gl/dist/maplibre-gl.css";

// Turbopack dev can't resolve maplibre's module-worker URL; serve the dist worker statically.
setWorkerUrl("/maplibre-gl-worker.mjs");

const BASEMAP = "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json";
// Texas fills the frame — closer, central, cropped edges are intentional.
const HOME = { center: [-98.9, 31.15] as [number, number], zoom: 6.05, pitch: 42, bearing: -9 };

const LIGHTING = new LightingEffect({
  ambient: new AmbientLight({ color: [228, 234, 246], intensity: 1.4 }),
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
  { name: "GULF OF MEXICO", pos: [-95.6, 27.6], size: 17 },
  { name: "PERMIAN BASIN", pos: [-102.6, 31.55], size: 13 },
  { name: "HILL COUNTRY", pos: [-99.35, 30.25], size: 12 },
  { name: "EAST TEXAS", pos: [-94.95, 31.9], size: 12 },
  { name: "PANHANDLE", pos: [-101.45, 35.2], size: 12 },
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

// The zoom is an illusion: one fixed diorama scale everywhere — assets and beams keep
// constant world size, legible at the wide view and simply framed larger on approach.
const ASSET_SCALE = 95;
const BEAM_MAX_H = 46000;   // meters at full COD progress
const BEAM_GLOW_R = 3400;
const BEAM_CORE_R = 1100;
const PEACH: [number, number, number] = [242, 196, 155];
// buildings always read as lit peach matter; heat warms them, never hides them
const buildingTint = (h: number, selected: boolean): [number, number, number, number] => {
  const c = heatColor(h);
  const mix = (i: number) => Math.min(255, Math.round(c[i] * 0.5 + PEACH[i] * 0.5 + (selected ? 26 : 0)));
  return [mix(0), mix(1), mix(2), 255];
};

// Progress → the height of the light beam rising from the asset.
const progressFrac = (p: Project): number => {
  if (p.current_stage === "operational" || p.current_stage === "cod") return 1;
  if (p.current_stage === "canceled") return 0;
  const i = STAGE_LADDER.indexOf(p.current_stage);
  return i < 0 ? 0.3 : (i + 1) / STAGE_LADDER.length;
};

// deterministic per-slug yaw so campuses sit at varied angles
const slugYaw = (slug: string) => {
  let h = 0; for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) | 0;
  return (h % 360 + 360) % 360;
};

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
  const crowdRef = useRef<Map<string, number>>(new Map());
  const [modelsReady, setModelsReady] = useState(false);
  const stateRef = useRef({ projects, projectIndex, feed, hot, pairs, pairedIds, selectedId, modelsReady });
  stateRef.current = { projects, projectIndex, feed, hot, pairs, pairedIds, selectedId, modelsReady };

  // prefab models become active the moment they exist on disk
  useEffect(() => {
    let live = true;
    const probe = () =>
      Promise.all([fetch("/models/datacenter.glb", { method: "HEAD" }), fetch("/models/powerplant.glb", { method: "HEAD" })])
        .then(([a, b]) => { if (live && a.ok && b.ok) setModelsReady(true); else if (live) setTimeout(probe, 4000); })
        .catch(() => { if (live) setTimeout(probe, 4000); });
    probe();
    return () => { live = false; };
  }, []);

  // crowding factor: clustered metros shrink their landmarks so they don't melt together
  useEffect(() => {
    const placed = projects.filter((p) => p.lat != null && p.lon != null);
    const m = new Map<string, number>();
    for (const a of placed) {
      let nearest = Infinity;
      for (const b of placed) {
        if (a.id === b.id) continue;
        const dx = (a.lon! - b.lon!) * 91, dy = (a.lat! - b.lat!) * 110.6;
        nearest = Math.min(nearest, Math.hypot(dx, dy));
      }
      m.set(a.id, Math.min(1, Math.max(0.5, nearest / 28)));
    }
    crowdRef.current = m;
  }, [projects]);

  // data-driven county warmth
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
      center: [-98.6, 30.9],
      zoom: 5.1,
      pitch: 0,
      bearing: 0,
      minZoom: 5.0,
      maxZoom: 10.5,
      attributionControl: { compact: true },
      maxPitch: 60,
    });
    const overlay = new MapboxOverlay({ interleaved: false, layers: [], effects: [LIGHTING] });
    map.addControl(overlay as unknown as IControl);
    mapRef.current = map;

    // Embedded panes can settle their layout after map init — maplibre's own
    // trackResize misses it, so we drive resize explicitly.
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    map.on("load", () => {
      // ——— the designed world: flat dark land, darker water, BRIGHT drawing ———
      try {
        for (const layer of map.getStyle().layers ?? []) {
          if (layer.type === "background") map.setPaintProperty(layer.id, "background-color", WORLD.background);
          if (layer.type === "fill" && /water|ocean/i.test(layer.id)) map.setPaintProperty(layer.id, "fill-color", WORLD.water);
          else if (layer.type === "fill" && /park|green|wood|grass/i.test(layer.id)) map.setPaintProperty(layer.id, "fill-color", WORLD.park);
          else if (layer.type === "fill" && /land|residential/i.test(layer.id)) map.setPaintProperty(layer.id, "fill-color", WORLD.land);
          if (layer.type === "line") {
            const road = /road|street|highway|motorway|trunk|primary|secondary|tertiary|minor|path|rail|transit/i.test(layer.id);
            const boundary = /admin|boundary|border/i.test(layer.id);
            if (road) {
              const majorRoad = /motorway|trunk|highway|primary/i.test(layer.id);
              map.setPaintProperty(layer.id, "line-color", majorRoad ? WORLD.roadMajor : WORLD.roadMinor);
              if (majorRoad) try { map.setPaintProperty(layer.id, "line-width", ["interpolate", ["linear"], ["zoom"], 5, 0.9, 8, 1.6, 12, 3]); } catch {}
            } else if (boundary) {
              map.setPaintProperty(layer.id, "line-color", WORLD.boundary);
            }
          }
        }
      } catch { /* basemap ids shift between versions; re-ink is best-effort */ }

      // counties: activity wash + hairlines
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
          "line-color": WORLD.countyLine,
          "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.35, 8, 1.0],
        },
      });
      countyWashRef.current?.();

      map.flyTo({ ...HOME, duration: 2800, essential: true });
    });

    const render = (now: number) => {
      const { projects, projectIndex, feed, hot, pairs, pairedIds, selectedId, modelsReady } = stateRef.current;
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

      const crowd = crowdRef.current;
      const sizeOf = (p: Project) => ASSET_SCALE * (crowd.get(p.id) ?? 1);

      // asset layers: prefab GLB landmarks once loaded; procedural fallback until then
      const assetLayers = modelsReady
        ? [
            new ScenegraphLayer<{ p: Project; h: number }>({
              id: "dc-models",
              data: dcs,
              scenegraph: "/models/datacenter.glb",
              loaders: [GLTFLoader],
              pickable: true,
              sizeScale: 1,
              getPosition: ({ p }) => [p.lon!, p.lat!],
              getOrientation: ({ p }) => [0, slugYaw(p.slug), 90],
              getScale: ({ p }) => { const s = sizeOf(p); return [s, s, s]; },
              getColor: ({ p, h }) => buildingTint(h, p.id === selectedId) as never,
              _lighting: "pbr",
              onClick: (info) => onSelect(info.object ? (info.object as { p: Project }).p.id : null),
              onHover: (info) =>
                onHover?.(info.object ? { project: (info.object as { p: Project; h: number }).p, heat: (info.object as { p: Project; h: number }).h, x: info.x, y: info.y } : null),
              updateTriggers: { getColor: [selectedId] },
            }),
            new ScenegraphLayer<{ p: Project; h: number }>({
              id: "gas-models",
              data: gas,
              scenegraph: "/models/powerplant.glb",
              loaders: [GLTFLoader],
              pickable: true,
              sizeScale: 1,
              getPosition: ({ p }) => [p.lon!, p.lat!],
              getOrientation: ({ p }) => [0, slugYaw(p.slug), 90],
              getScale: ({ p }) => { const s = sizeOf(p); return [s, s, s]; },
              getColor: ({ p, h }) => buildingTint(h, p.id === selectedId) as never,
              _lighting: "pbr",
              onClick: (info) => onSelect(info.object ? (info.object as { p: Project }).p.id : null),
              onHover: (info) =>
                onHover?.(info.object ? { project: (info.object as { p: Project; h: number }).p, heat: (info.object as { p: Project; h: number }).h, x: info.x, y: info.y } : null),
              updateTriggers: { getColor: [selectedId] },
            }),
          ]
        : [
            new PolygonLayer<{ p: Project; h: number; block: CampusBlock }>({
              id: "campus-fallback",
              data: scored.flatMap((s) => buildCampus(s.p, ASSET_SCALE).map((block) => ({ ...s, block }))),
              pickable: true,
              extruded: true,
              material: MATERIAL,
              getPolygon: (d) => d.block.polygon,
              getElevation: (d) => d.block.height * ASSET_SCALE * 0.85,
              getFillColor: (d) => buildingTint(d.h, d.p.id === selectedId) as never,
              onClick: (info) => onSelect(info.object ? info.object.p.id : null),
              onHover: (info) =>
                onHover?.(info.object ? { project: info.object.p, heat: info.object.h, x: info.x, y: info.y } : null),
              updateTriggers: { getFillColor: [selectedId] },
            }),
          ];

      overlay.setProps({
        layers: [
          // BTM pairing tethers
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
          // filing arcs
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
            getRadius: () => 6000 + t * 34000,
            getLineColor: ({ h }) => [...heatColor(h), Math.round(210 * (1 - t))] as never,
            stroked: true,
            filled: false,
            lineWidthMinPixels: 1.5,
            radiusUnits: "meters",
            updateTriggers: { getRadius: t, getLineColor: t },
          }),
          ...assetLayers,
          // PROGRESS AS LIGHT — a beam rising from each asset; height = ladder progress.
          // Soft outer glow + bright core, so the building and its trajectory are one object.
          new ColumnLayer<{ p: Project; h: number }>({
            id: "beam-glow",
            data: scored.filter(({ p }) => p.current_stage !== "canceled"),
            diskResolution: 10,
            radius: BEAM_GLOW_R,
            extruded: true,
            getPosition: ({ p }) => [p.lon!, p.lat!],
            getElevation: ({ p }) => BEAM_MAX_H * progressFrac(p),
            getFillColor: ({ p, h }) => [...heatColor(h), p.id === selectedId ? 90 : 48] as never,
            updateTriggers: { getFillColor: [selectedId] },
          }),
          new ColumnLayer<{ p: Project; h: number }>({
            id: "beam-core",
            data: scored.filter(({ p }) => p.current_stage !== "canceled"),
            diskResolution: 10,
            radius: BEAM_CORE_R,
            extruded: true,
            getPosition: ({ p }) => [p.lon!, p.lat!],
            getElevation: ({ p }) => BEAM_MAX_H * progressFrac(p),
            getFillColor: ({ p, h }) => {
              const c = p.id === selectedId ? [255, 250, 240] : heatColor(Math.min(1, h + 0.15));
              return [c[0], c[1], c[2], p.id === selectedId ? 235 : 165] as never;
            },
            updateTriggers: { getFillColor: [selectedId] },
          }),
          // ground anchors (small-zoom click targets)
          new ScatterplotLayer({
            id: "anchors",
            data: scored,
            pickable: true,
            getPosition: ({ p }) => [p.lon!, p.lat!],
            getRadius: ({ p }) => 2200 + Math.sqrt(p.capacity_mw ?? 6) * 1000,
            radiusMinPixels: 3,
            radiusMaxPixels: 16,
            getFillColor: ({ p, h }) => [...heatColor(h), p.id === selectedId ? 255 : 175] as never,
            getLineColor: ({ p }) => (p.id === selectedId ? [255, 250, 240, 255] : [14, 20, 28, 220]) as never,
            getLineWidth: ({ p }) => (p.id === selectedId ? 2.2 : 1),
            lineWidthUnits: "pixels",
            stroked: true,
            onClick: (info) => onSelect(info.object ? (info.object as { p: Project }).p.id : null),
            onHover: (info) => onHover?.(info.object ? { project: (info.object as { p: Project; h: number }).p, heat: (info.object as { p: Project; h: number }).h, x: info.x, y: info.y } : null),
            updateTriggers: { getFillColor: [selectedId], getLineColor: selectedId, getLineWidth: selectedId },
          }),
          // regions + cities + hot project names
          new TextLayer({
            id: "region-labels",
            data: REGIONS,
            getPosition: (r) => r.pos,
            getText: (r) => spaced(r.name),
            getSize: (r) => r.size,
            getColor: [200, 212, 230, 84],
            fontFamily: '"Fraunces", Georgia, "Times New Roman", serif',
            fontWeight: 400,
            outlineWidth: 2,
            outlineColor: [12, 18, 26, 200],
            fontSettings: { sdf: true },
          }),
          new TextLayer({
            id: "city-labels",
            data: CITIES,
            getPosition: (c) => c.pos,
            getText: (c) => c.name.toUpperCase(),
            getSize: (c) => (c.major ? 16 : 12),
            getColor: (c) => (c.major ? [230, 224, 212, 185] : [190, 186, 176, 120]),
            fontFamily: '"Fraunces", Georgia, "Times New Roman", serif',
            fontWeight: 500,
            getTextAnchor: "start",
            getAlignmentBaseline: "center",
            getPixelOffset: [10, 0],
            outlineWidth: 3,
            outlineColor: [12, 18, 26, 235],
            fontSettings: { sdf: true },
          }),
          new TextLayer({
            id: "project-labels",
            data: [
              ...topHot.filter(({ p }) => p.id !== selectedId),
              ...(selectedId
                ? (() => {
                    const pr = pairs.find((x) => x.dcId === selectedId || x.gasId === selectedId);
                    const other = pr ? projectIndex.get(pr.dcId === selectedId ? pr.gasId : pr.dcId) : null;
                    return other && other.lon != null ? [{ p: other, h: heatScore(other), rank: 0 }] : [];
                  })()
                : []),
            ],
            getPosition: ({ p }) => [p.lon!, p.lat!],
            getText: ({ p }) => `${p.name.length > 26 ? p.name.slice(0, 24) + "…" : p.name}  ·  ${p.capacity_mw ? Math.round(p.capacity_mw) + " MW" : "— MW"}`,
            getSize: 11.5,
            getColor: ({ h }) => [...heatColor(Math.max(h, 0.5)), 240] as never,
            fontFamily: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
            fontWeight: 500,
            getTextAnchor: "start",
            getAlignmentBaseline: "bottom",
            getPixelOffset: (d: { rank: number }) => [14, -18 - d.rank * 17],
            outlineWidth: 4,
            outlineColor: [12, 18, 26, 245],
            fontSettings: { sdf: true },
          }),
        ],
      });
      frameRef.current = requestAnimationFrame(render);
    };
    frameRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frameRef.current);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SHORT flight that frames the asset AND its power pairing together
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const p = projects.find((x) => x.id === selectedId);
    if (p?.lat == null || p?.lon == null) return;
    const pr = pairs.find((x) => x.dcId === selectedId || x.gasId === selectedId);
    const other = pr ? projects.find((x) => x.id === (pr.dcId === selectedId ? pr.gasId : pr.dcId)) : null;
    const pts: [number, number][] = [[p.lon, p.lat]];
    if (other?.lon != null && other?.lat != null) pts.push([other.lon, other.lat]);
    const lons = pts.map((q) => q[0]), lats = pts.map((q) => q[1]);
    const pad = 0.12;
    const cam = map.cameraForBounds(
      [[Math.min(...lons) - pad, Math.min(...lats) - pad], [Math.max(...lons) + pad, Math.max(...lats) + pad]],
      { padding: { left: 540, top: 90, right: 110, bottom: 110 }, bearing: -14 },
    );
    map.flyTo({
      center: cam?.center ?? [p.lon, p.lat],
      zoom: Math.min(cam?.zoom ?? 8.6, 9.3),
      pitch: 50,
      bearing: -14,
      duration: 1300,
      essential: true,
    });
  }, [selectedId, projects, pairs]);

  const hadSelection = useRef(false);
  useEffect(() => {
    if (selectedId) { hadSelection.current = true; return; }
    if (hadSelection.current && mapRef.current) {
      mapRef.current.flyTo({ ...HOME, padding: { left: 0, top: 0, right: 0, bottom: 0 }, duration: 1200, essential: true });
    }
  }, [selectedId]);

  return (
    <div style={{ position: "absolute", inset: 0 }} role="application" aria-label="Texas project map">
      {/* maplibre-gl.css sets .maplibregl-map{position:relative} which beats the Tailwind
          class (later import, same specificity) — inline styles win, hence this wrapper. */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      <div aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "linear-gradient(180deg, rgba(96,98,150,0.09) 0%, rgba(255,170,110,0.03) 22%, transparent 42%)",
      }} />
      <div aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(120% 95% at 46% 42%, transparent 56%, rgba(10,16,24,0.4) 100%)",
      }} />
      <div aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.05, mixBlendMode: "overlay",
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.7'/%3E%3C/svg%3E\")",
      }} />
    </div>
  );
}
