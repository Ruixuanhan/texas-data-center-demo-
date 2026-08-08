/**
 * build-models.ts — generates stylized low-poly .glb building models for the
 * deck.gl ScenegraphLayer (datacenter.glb, powerplant.glb).
 *
 * Run: bun scripts/build-models.ts
 *
 * Conventions:
 * - glTF Y-up, real-world meters, model centered at origin on the ground plane (min Y = 0).
 * - Flat shading: every face gets duplicated vertices with per-face normals (no smoothing).
 * - Near-white grayscale materials only — the app tints models at runtime via
 *   ScenegraphLayer getColor (multiplicative), so base colors carry shading variety only.
 */

import { mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Document, NodeIO, type Material } from "@gltf-transform/core";

// ---------------------------------------------------------------------------
// Geometry accumulation (one bucket per material -> one primitive per material)
// ---------------------------------------------------------------------------

interface Geo {
  positions: number[];
  normals: number[];
  indices: number[];
}

type MaterialKey = "walls" | "roof" | "unit" | "tank";

const MATERIAL_COLORS: Record<MaterialKey, [number, number, number, number]> = {
  walls: [1, 1, 1, 1],
  roof: [0.82, 0.8, 0.78, 1],
  unit: [0.92, 0.9, 0.88, 1], // stacks + CRAC/AHU units
  tank: [0.75, 0.74, 0.72, 1], // tanks + substation
};

type Buckets = Record<MaterialKey, Geo>;

function createBuckets(): Buckets {
  const empty = (): Geo => ({ positions: [], normals: [], indices: [] });
  return { walls: empty(), roof: empty(), unit: empty(), tank: empty() };
}

/** Push one quad (4 verts, CCW from outside) with a single flat normal. */
function pushQuad(
  geo: Geo,
  verts: [number, number, number][],
  normal: [number, number, number],
): void {
  const base = geo.positions.length / 3;
  for (const [x, y, z] of verts) {
    geo.positions.push(x, y, z);
    geo.normals.push(...normal);
  }
  geo.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

interface BoxSpec {
  cx: number; // center X
  cy: number; // BASE Y (bottom of the box)
  cz: number; // center Z
  w: number; // extent along X
  h: number; // extent along Y
  d: number; // extent along Z
  material: MaterialKey;
}

/** Axis-aligned box, 24 vertices (4 per face), per-face normals — crisp flat shading. */
function addBox(buckets: Buckets, { cx, cy, cz, w, h, d, material }: BoxSpec): void {
  const geo = buckets[material];
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy;
  const y1 = cy + h;
  const z0 = cz - d / 2;
  const z1 = cz + d / 2;

  // +X
  pushQuad(geo, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0]);
  // -X
  pushQuad(geo, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]);
  // +Y (top)
  pushQuad(geo, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0]);
  // -Y (bottom)
  pushQuad(geo, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]);
  // +Z
  pushQuad(geo, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]);
  // -Z
  pushQuad(geo, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]);
}

interface CylinderSpec {
  cx: number;
  cy: number; // BASE Y
  cz: number;
  r: number;
  h: number;
  material: MaterialKey;
  segments?: number;
}

/** Upright cylinder with faceted (per-face-normal) sides and flat caps. */
function addCylinder(
  buckets: Buckets,
  { cx, cy, cz, r, h, material, segments = 14 }: CylinderSpec,
): void {
  const geo = buckets[material];
  const y0 = cy;
  const y1 = cy + h;
  const ring: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    ring.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
  }

  // Faceted side quads.
  for (let i = 0; i < segments; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % segments];
    const mx = (ax + bx) / 2 - cx;
    const mz = (az + bz) / 2 - cz;
    const len = Math.hypot(mx, mz);
    const n: [number, number, number] = [mx / len, 0, mz / len];
    // CCW from outside: b-bottom, a-bottom, a-top, b-top.
    pushQuad(geo, [[bx, y0, bz], [ax, y0, az], [ax, y1, az], [bx, y1, bz]], n);
  }

  // Caps (flat fans around a center vertex).
  const cap = (y: number, ny: 1 | -1) => {
    const base = geo.positions.length / 3;
    geo.positions.push(cx, y, cz);
    geo.normals.push(0, ny, 0);
    for (const [x, z] of ring) {
      geo.positions.push(x, y, z);
      geo.normals.push(0, ny, 0);
    }
    for (let i = 0; i < segments; i++) {
      const a = base + 1 + i;
      const b = base + 1 + ((i + 1) % segments);
      if (ny === 1) geo.indices.push(base, b, a); // top: CCW seen from above
      else geo.indices.push(base, a, b); // bottom: CCW seen from below
    }
  };
  cap(y1, 1);
  cap(y0, -1);
}

// ---------------------------------------------------------------------------
// Recenter on the ground plane (XZ) so the footprint centroid sits at origin.
// ---------------------------------------------------------------------------

function recenterXZ(buckets: Buckets): void {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const geo of Object.values(buckets)) {
    for (let i = 0; i < geo.positions.length; i += 3) {
      minX = Math.min(minX, geo.positions[i]);
      maxX = Math.max(maxX, geo.positions[i]);
      minZ = Math.min(minZ, geo.positions[i + 2]);
      maxZ = Math.max(maxZ, geo.positions[i + 2]);
    }
  }
  const ox = (minX + maxX) / 2;
  const oz = (minZ + maxZ) / 2;
  for (const geo of Object.values(buckets)) {
    for (let i = 0; i < geo.positions.length; i += 3) {
      geo.positions[i] -= ox;
      geo.positions[i + 2] -= oz;
    }
  }
}

// ---------------------------------------------------------------------------
// glTF document assembly
// ---------------------------------------------------------------------------

function buildDocument(name: string, buckets: Buckets): Document {
  recenterXZ(buckets);

  const doc = new Document();
  doc.getRoot().getAsset().generator = "radar build-models.ts (@gltf-transform/core)";
  const buffer = doc.createBuffer("geometry");
  const mesh = doc.createMesh(name);

  for (const key of Object.keys(MATERIAL_COLORS) as MaterialKey[]) {
    const geo = buckets[key];
    if (geo.indices.length === 0) continue;

    const material: Material = doc
      .createMaterial(key)
      .setBaseColorFactor(MATERIAL_COLORS[key])
      .setMetallicFactor(0)
      .setRoughnessFactor(0.9);

    const position = doc
      .createAccessor(`${key}-position`)
      .setType("VEC3")
      .setArray(new Float32Array(geo.positions))
      .setBuffer(buffer);
    const normal = doc
      .createAccessor(`${key}-normal`)
      .setType("VEC3")
      .setArray(new Float32Array(geo.normals))
      .setBuffer(buffer);
    const indices = doc
      .createAccessor(`${key}-indices`)
      .setType("SCALAR")
      .setArray(new Uint16Array(geo.indices))
      .setBuffer(buffer);

    mesh.addPrimitive(
      doc
        .createPrimitive()
        .setAttribute("POSITION", position)
        .setAttribute("NORMAL", normal)
        .setIndices(indices)
        .setMaterial(material),
    );
  }

  const node = doc.createNode(name).setMesh(mesh);
  const scene = doc.createScene(name).addChild(node);
  doc.getRoot().setDefaultScene(scene);
  return doc;
}

// ---------------------------------------------------------------------------
// Model: hyperscale data center campus
// ---------------------------------------------------------------------------

function buildDatacenter(): Document {
  const buckets = createBuckets();

  const HALL_W = 85; // X
  const HALL_L = 210; // Z
  const HALL_H = 16;
  const GAP = 45;
  const hallX = GAP / 2 + HALL_W / 2; // 65m from campus centerline

  for (const sx of [-1, 1]) {
    const cx = sx * hallX;
    // Server hall.
    addBox(buckets, { cx, cy: 0, cz: 0, w: HALL_W, h: HALL_H, d: HALL_L, material: "walls" });
    // Roof parapet lip: slightly-inset box, 1.5m tall, on top.
    addBox(buckets, { cx, cy: HALL_H, cz: 0, w: HALL_W - 4, h: 1.5, d: HALL_L - 4, material: "roof" });
    // 5 rooftop CRAC/AHU units spaced along the roof.
    for (const cz of [-80, -40, 0, 40, 80]) {
      addBox(buckets, { cx, cy: HALL_H + 1.5, cz, w: 14, h: 4, d: 10, material: "unit" });
    }
  }

  // Substation block at one end, between the halls.
  addBox(buckets, { cx: 0, cy: 0, cz: 75, w: 40, h: 8, d: 40, material: "tank" });
  // Two thin transformer boxes beside it.
  addBox(buckets, { cx: -7, cy: 0, cz: 48, w: 8, h: 5, d: 4, material: "tank" });
  addBox(buckets, { cx: 7, cy: 0, cz: 48, w: 8, h: 5, d: 4, material: "tank" });

  return buildDocument("datacenter", buckets);
}

// ---------------------------------------------------------------------------
// Model: gas power plant
// ---------------------------------------------------------------------------

function buildPowerplant(): Document {
  const buckets = createBuckets();

  // Turbine hall (130 x 55 footprint, 26m tall) + thin roof cap for tonal variety.
  addBox(buckets, { cx: 0, cy: 0, cz: 0, w: 130, h: 26, d: 55, material: "walls" });
  addBox(buckets, { cx: 0, cy: 26, cz: 0, w: 126, h: 1.2, d: 51, material: "roof" });

  // Lower attached annex (55 x 30 footprint, 14m tall) on the +Z side.
  addBox(buckets, { cx: -20, cy: 0, cz: 42.5, w: 55, h: 14, d: 30, material: "walls" });
  addBox(buckets, { cx: -20, cy: 14, cz: 42.5, w: 52, h: 1, d: 27, material: "roof" });

  // Air-intake / filter house attached to the hall side (-Z).
  addBox(buckets, { cx: 20, cy: 0, cz: -40, w: 35, h: 18, d: 25, material: "unit" });

  // Two exhaust stacks at the -X end of the hall.
  addCylinder(buckets, { cx: -72, cy: 0, cz: -14, r: 7, h: 75, material: "unit", segments: 14 });
  addCylinder(buckets, { cx: -72, cy: 0, cz: 14, r: 7, h: 68, material: "unit", segments: 14 });

  // Three cylindrical storage tanks in a row nearby (+X side).
  for (const cz of [-26, 0, 26]) {
    addCylinder(buckets, { cx: 88, cy: 0, cz, r: 9, h: 12, material: "tank", segments: 14 });
  }

  return buildDocument("powerplant", buckets);
}

// ---------------------------------------------------------------------------
// Write + verify
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const outDir = resolve(import.meta.dir, "../public/models");
  mkdirSync(outDir, { recursive: true });

  const io = new NodeIO();
  const models: Array<[string, Document]> = [
    ["datacenter.glb", buildDatacenter()],
    ["powerplant.glb", buildPowerplant()],
  ];

  for (const [filename, doc] of models) {
    const path = resolve(outDir, filename);
    mkdirSync(dirname(path), { recursive: true });
    await io.write(path, doc);

    // Verify: file exists and reloads cleanly.
    const bytes = statSync(path).size;
    const reloaded = await io.read(path);
    const root = reloaded.getRoot();
    const prims = root
      .listMeshes()
      .reduce((sum, m) => sum + m.listPrimitives().length, 0);
    let minY = Infinity;
    for (const m of root.listMeshes()) {
      for (const p of m.listPrimitives()) {
        const min = p.getAttribute("POSITION")?.getMin([0, 0, 0]) ?? [0, 0, 0];
        minY = Math.min(minY, min[1]);
      }
    }
    console.log(
      `${path}  ${bytes} bytes  reload OK  (${prims} primitives, ${root.listMaterials().length} materials, minY=${minY})`,
    );
  }
}

await main();
