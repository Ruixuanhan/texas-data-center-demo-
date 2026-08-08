"use client";
// The hero. MapLibre (Carto dark-matter, no vendor token) + deck.gl overlay.
// Layers: base scatter (MW-scaled, stage-colored) + animated pulse rings on "hot"
// projects (those that fired a signal in the last few seconds).
import { useEffect, useRef } from "react";
import { Map as MapLibreMap, setWorkerUrl, type IControl } from "maplibre-gl";

// Turbopack dev can't resolve maplibre's module-worker URL (serves the 404 page as
// text/html → worker dies → no style/tiles). Serve the dist worker statically instead.
setWorkerUrl("/maplibre-gl-worker.mjs");
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ScatterplotLayer } from "@deck.gl/layers";
import type { Project } from "@/lib/types";
import { STAGE_COLORS } from "@/lib/theme";
import "maplibre-gl/dist/maplibre-gl.css";

const BASEMAP = "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json";
const TEXAS = { longitude: -99.2, latitude: 31.2, zoom: 5.4, pitch: 0, bearing: 0 };

export function MapCanvas({
  projects,
  hot,
  selectedId,
  onSelect,
}: {
  projects: Project[];
  hot: Set<string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const frameRef = useRef<number>(0);
  const stateRef = useRef({ projects, hot, selectedId });
  stateRef.current = { projects, hot, selectedId };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: BASEMAP,
      center: [TEXAS.longitude, TEXAS.latitude],
      zoom: TEXAS.zoom,
      attributionControl: { compact: true },
    });
    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(overlay as unknown as IControl);
    mapRef.current = map;
    overlayRef.current = overlay;

    const render = (now: number) => {
      const { projects, hot, selectedId } = stateRef.current;
      const placed = projects.filter((p) => p.lat != null && p.lon != null);
      const t = (now % 2000) / 2000; // 2s pulse cycle
      const hotProjects = placed.filter((p) => hot.has(p.id));

      overlay.setProps({
        layers: [
          new ScatterplotLayer<Project>({
            id: "pulse",
            data: hotProjects,
            getPosition: (p) => [p.lon!, p.lat!],
            getRadius: () => 4000 + t * 26000,
            getFillColor: [0, 0, 0, 0],
            getLineColor: (p) => [...STAGE_COLORS[p.current_stage], Math.round(200 * (1 - t))] as [number, number, number, number],
            stroked: true,
            filled: false,
            lineWidthMinPixels: 1.5,
            radiusUnits: "meters",
            updateTriggers: { getRadius: t, getLineColor: t },
          }),
          new ScatterplotLayer<Project>({
            id: "projects",
            data: placed,
            pickable: true,
            getPosition: (p) => [p.lon!, p.lat!],
            getRadius: (p) => 2500 + Math.sqrt(p.capacity_mw ?? 8) * 1800,
            radiusUnits: "meters",
            radiusMinPixels: 3,
            radiusMaxPixels: 26,
            getFillColor: (p) => {
              const c = STAGE_COLORS[p.current_stage];
              const alpha = p.id === selectedId ? 255 : hot.has(p.id) ? 235 : 175;
              return [...c, alpha] as [number, number, number, number];
            },
            getLineColor: (p) => (p.id === selectedId ? [255, 255, 255, 255] : [10, 14, 18, 200]),
            getLineWidth: (p) => (p.id === selectedId ? 2 : 1),
            lineWidthUnits: "pixels",
            stroked: true,
            onClick: (info) => onSelect(info.object ? (info.object as Project).id : null),
            updateTriggers: { getFillColor: [selectedId, hot], getLineColor: selectedId, getLineWidth: selectedId },
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

  // Cinematic fly-to on selection
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const p = projects.find((x) => x.id === selectedId);
    if (p?.lat != null && p?.lon != null) {
      map.flyTo({ center: [p.lon + 0.35, p.lat], zoom: 8.2, speed: 0.9, curve: 1.6, essential: true });
    }
  }, [selectedId, projects]);

  // Inline style: maplibre-gl.css sets .maplibregl-map{position:relative}, which would
  // override the Tailwind `absolute` class (same specificity, later import) and collapse
  // the container to zero height. Inline wins.
  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} role="application" aria-label="Texas project map" />;
}
