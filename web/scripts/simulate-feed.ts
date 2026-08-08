/**
 * Project Radar — seed + live feed simulator.
 *   bun scripts/simulate-feed.ts --seed   backfill projects, aliases, stage history, ~200 backdated events
 *   bun scripts/simulate-feed.ts --live   insert a plausible event every 20–60s (stage change ~10% of the time)
 * Requires SUPABASE_URL + SUPABASE_SECRET_KEY (run via: doppler run -- bun scripts/simulate-feed.ts --seed)
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SECRET_KEY (use `doppler run --`)");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

type Stage = "concept" | "fel1" | "fel2" | "feed" | "ia" | "fid" | "construction" | "cod" | "operational" | "canceled";
const rand = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString();

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.length > 1);
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

const EVENT_TEMPLATES: Array<{ source: string; event_type: string; severity: string; title: (p: any) => string }> = [
  { source: "ercot_gis", event_type: "queue_update", severity: "notable", title: (p) => `ERCOT GIS: ${p.name} listed in monthly interconnection report (${p.county} Co)` },
  { source: "ercot_rioo", event_type: "queue_update", severity: "notable", title: (p) => `RIOO interconnection request updated — ${p.name}, ${Math.round(p.capacity_mw || 50)} MW` },
  { source: "tceq", event_type: "permit", severity: "notable", title: (p) => `TCEQ air permit ${100000 + Math.floor(Math.random() * 99999)} filed — ${p.county} County` },
  { source: "puct", event_type: "docket", severity: "low", title: (p) => `PUCT interchange docket ${50000 + Math.floor(Math.random() * 9999)} references ${p.developer || p.name}` },
  { source: "county", event_type: "agenda", severity: "low", title: (p) => `${p.county} County commissioners' agenda: tax abatement discussion, unnamed data center` },
  { source: "press", event_type: "news", severity: "low", title: (p) => `Trade press: ${p.developer || "developer"} evaluating ${p.county} County site expansion` },
  { source: "rrc", event_type: "filing", severity: "low", title: (p) => `RRC filing: gas supply nomination near ${p.city || p.county}` },
  { source: "earnings", event_type: "earnings_mention", severity: "notable", title: (p) => `Earnings call: ${p.developer || "operator"} cites Texas pipeline, "${p.name}" timeline reaffirmed` },
  { source: "oem_epc", event_type: "order", severity: "major", title: (p) => `OEM order: turbine/generation equipment reservation linked to ${p.county} Co project` },
];

async function seed() {
  const csv = readFileSync(join(import.meta.dir, "../../texas_datacenter_projects.csv"), "utf8");
  const rows = parseCsv(csv);
  console.log(`CSV rows: ${rows.length}`);

  const projects = rows.map((r) => {
    const early = r.stage === "Early Stage";
    const stage: Stage = r.stage === "Operational" ? "operational" : r.stage === "Canceled" ? "canceled" : rand<Stage>(["concept", "fel1", "fel2", "feed"]);
    return {
      slug: slugify(r.project_name),
      name: r.project_name,
      developer: r.developer || null,
      city: r.city || null,
      county: r.county || null,
      lat: parseFloat(r.latitude) || null,
      lon: parseFloat(r.longitude) || null,
      capacity_mw: r.estimated_mw ? parseFloat(r.estimated_mw) : null,
      current_stage: stage,
      stage_confidence: early ? +between(0.35, 0.75).toFixed(2) : 0.95,
      headline: r.latest_signal || null,
      first_seen: daysAgo(between(30, 400)),
      last_activity: daysAgo(between(0, 10)),
    };
  });

  const { data: upserted, error } = await db.from("projects").upsert(projects, { onConflict: "slug" }).select("id,slug,name,developer,city,county,capacity_mw,current_stage,stage_confidence");
  if (error) throw error;
  console.log(`Projects upserted: ${upserted.length}`);

  // Stage history for every project
  const history = upserted.map((p) => ({
    project_id: p.id, stage: p.current_stage, confidence: p.stage_confidence ?? 0.9,
    rationale: p.current_stage === "operational" ? "Cleanview status: Operating" : "Inferred from earliest public signals",
    inferred_by: "rules", inferred_at: daysAgo(between(5, 60)),
  }));
  await db.from("stage_history").insert(history).then(({ error: e }) => { if (e) throw e; });

  // ~200 backdated events across all projects
  const events = Array.from({ length: 200 }, () => {
    const p = rand(upserted); const t = rand(EVENT_TEMPLATES);
    const when = daysAgo(between(0, 60));
    return { project_id: p.id, source: t.source, event_type: t.event_type, severity: t.severity, title: t.title(p), url: "https://example.com/filing", occurred_at: when, ingested_at: when };
  });
  // A handful of unattributed signals (the ER showcase lane)
  for (let i = 0; i < 8; i++) {
    const when = daysAgo(between(0, 14));
    events.push({ project_id: null as any, source: rand(["county", "press", "puct"]), event_type: "filing", severity: "low", title: rand([
      "Bastrop Co agenda: water agreement, unnamed 'Project Longhorn'",
      "LLC formation: Prairie Switch Holdings LLC, Delaware, registered agent Austin",
      "PUCT docket mentions 300MW load letter, counterparty undisclosed",
      "Press: hyperscaler scouting West Texas sites, sources say",
    ]), url: "https://example.com/filing", occurred_at: when, ingested_at: when });
  }
  await db.from("source_events").insert(events).then(({ error: e }) => { if (e) throw e; });
  console.log(`Events inserted: ${events.length}`);

  // ——— The money project: Blueprint Projects Taylor City — full multi-source arc ———
  const money = upserted.find((p) => p.slug.startsWith("blueprint-projects-taylor-city"));
  if (money) {
    await db.from("projects").update({ current_stage: "fel2", stage_confidence: 0.78, headline: "TCEQ permit filed; ERCOT queue position confirmed — advancing through pre-FEED" }).eq("id", money.id);
    await db.from("project_aliases").insert([
      { project_id: money.id, alias: "Lonestar Land Holdings LLC", alias_type: "llc", confidence: 0.91, source: "county" },
      { project_id: money.id, alias: "Project Bluebonnet", alias_type: "queue_name", confidence: 0.84, source: "ercot_gis" },
      { project_id: money.id, alias: "Blueprint TX-1", alias_type: "permit_name", confidence: 0.88, source: "tceq" },
    ]);
    const arc = [
      { d: 55, source: "county", event_type: "agenda", severity: "low", title: "Williamson Co commissioners: land use variance, applicant Lonestar Land Holdings LLC" },
      { d: 41, source: "press", event_type: "news", severity: "low", title: "Taylor ISD board minutes reference utility study for unnamed industrial user" },
      { d: 33, source: "ercot_gis", event_type: "queue_update", severity: "notable", title: "ERCOT GIS: new entry 'Project Bluebonnet' — 30MW, Williamson Co" },
      { d: 19, source: "tceq", event_type: "permit", severity: "notable", title: "TCEQ air permit 171203 filed — Blueprint TX-1, backup generation, Taylor" },
      { d: 6, source: "earnings", event_type: "earnings_mention", severity: "major", title: "Blueprint Projects earnings call: 'Taylor City campus on track for FEED entry Q4'" },
    ].map((e) => ({ project_id: money.id, source: e.source, event_type: e.event_type, severity: e.severity, title: e.title, url: "https://example.com/filing", occurred_at: daysAgo(e.d), ingested_at: daysAgo(e.d) }));
    await db.from("source_events").insert(arc);
    await db.from("stage_history").insert([
      { project_id: money.id, stage: "concept", confidence: 0.4, rationale: "County agenda + LLC land activity", inferred_by: "rules", inferred_at: daysAgo(50) },
      { project_id: money.id, stage: "fel1", confidence: 0.62, rationale: "ERCOT queue entry under alias 'Project Bluebonnet'", inferred_by: "llm", inferred_at: daysAgo(30) },
      { project_id: money.id, stage: "fel2", confidence: 0.78, rationale: "TCEQ permit + earnings-call FEED timeline", inferred_by: "llm", inferred_at: daysAgo(5) },
    ]);
    console.log("Money project curated: Blueprint Projects Taylor City (fel2 @ 0.78)");
  }
  console.log("Seed complete.");
}

async function live() {
  const { data: projects, error } = await db.from("projects").select("id,slug,name,developer,city,county,capacity_mw,current_stage").neq("current_stage", "canceled");
  if (error) throw error;
  const early = projects.filter((p) => ["concept", "fel1", "fel2", "feed"].includes(p.current_stage));
  console.log(`Simulator live — ${projects.length} projects (${early.length} early-stage weighted). Ctrl-C to stop.`);
  const ladder: Stage[] = ["concept", "fel1", "fel2", "feed", "ia", "fid", "construction", "cod"];

  const tick = async () => {
    const pool = Math.random() < 0.7 && early.length ? early : projects;
    const p = rand(pool);
    if (Math.random() < 0.1 && ladder.includes(p.current_stage as Stage) && p.current_stage !== "cod") {
      const next = ladder[ladder.indexOf(p.current_stage as Stage) + 1];
      const conf = +between(0.55, 0.9).toFixed(2);
      await db.from("stage_history").insert({ project_id: p.id, stage: next, confidence: conf, rationale: "New filing pattern matches stage transition", inferred_by: "llm" });
      await db.from("projects").update({ current_stage: next, stage_confidence: conf, last_activity: new Date().toISOString(), headline: `Advanced to ${next.toUpperCase()} — confidence ${conf}` }).eq("id", p.id);
      await db.from("source_events").insert({ project_id: p.id, source: "simulator", event_type: "stage_change", severity: "major", title: `${p.name} advances to ${next.toUpperCase()} (confidence ${conf})`, url: "https://example.com/filing" });
      p.current_stage = next;
      console.log(`⛰ stage_change ${p.slug} → ${next}`);
    } else {
      const t = rand(EVENT_TEMPLATES);
      await db.from("source_events").insert({ project_id: p.id, source: t.source, event_type: t.event_type, severity: t.severity, title: t.title(p), url: "https://example.com/filing" });
      await db.from("projects").update({ last_activity: new Date().toISOString() }).eq("id", p.id);
      console.log(`● ${t.source} → ${p.slug}`);
    }
    setTimeout(tick, between(20_000, 60_000));
  };
  tick();
}

// ——— Gas-to-power plants adjacent to early-stage DCs: the behind-the-meter pairing story ———
async function addGas() {
  const { data: dcs, error } = await db.from("projects")
    .select("id,slug,name,county,city,lat,lon,capacity_mw,current_stage")
    .eq("project_type", "data_center")
    .in("current_stage", ["concept", "fel1", "fel2", "feed", "ia"]);
  if (error) throw error;
  const anchors = (dcs ?? []).filter((p) => p.lat && p.lon).slice(0, 8);
  const plants = anchors.map((dc, i) => {
    const ang = Math.random() * Math.PI * 2, dist = between(0.035, 0.11); // ~4–12 km
    const stage = rand<Stage>(["fel1", "fel2", "feed", "construction"]);
    return {
      slug: `${dc.slug}-gas-${i}`,
      name: `${dc.county ?? "Lone Star"} Energy Center ${i + 1}`,
      developer: rand(["Lonestar Generation LLC", "Brazos Peaker Partners", "GulfBridge Power", "Caprock Energy Devco"]),
      county: dc.county, city: dc.city,
      lat: dc.lat! + Math.sin(ang) * dist, lon: dc.lon! + Math.cos(ang) * dist,
      capacity_mw: Math.round(between(90, 400)),
      project_type: "gas_to_power",
      current_stage: stage,
      stage_confidence: +between(0.5, 0.85).toFixed(2),
      headline: "Behind-the-meter gas generation sited against adjacent data-center load",
      first_seen: daysAgo(between(20, 120)), last_activity: daysAgo(between(0, 6)),
    };
  });
  // two standalone West Texas plants so the pattern isn't universal
  plants.push({
    slug: "permian-switch-gas-1", name: "Permian Switch Energy Center",
    developer: "Caprock Energy Devco", county: "Midland", city: "Midland",
    lat: 32.09, lon: -102.2, capacity_mw: 320, project_type: "gas_to_power",
    current_stage: "fel2", stage_confidence: 0.61,
    headline: "Gas peaker at Permian gateway — load counterparty undisclosed",
    first_seen: daysAgo(90), last_activity: daysAgo(2),
  } as never);
  const { data: up, error: e2 } = await db.from("projects").upsert(plants, { onConflict: "slug" }).select("id,slug,name,county,capacity_mw");
  if (e2) throw e2;
  const events = (up ?? []).flatMap((p) => [
    { project_id: p.id, source: "rrc", event_type: "filing", severity: "notable", title: `RRC: gas nomination + pipeline interconnect filed — ${p.name}`, url: "https://example.com/filing", occurred_at: daysAgo(between(2, 30)), ingested_at: daysAgo(between(0, 2)) },
    { project_id: p.id, source: "tceq", event_type: "permit", severity: "notable", title: `TCEQ air permit ${140000 + Math.floor(Math.random() * 9999)} — ${Math.round(p.capacity_mw ?? 200)} MW simple-cycle, ${p.county} Co`, url: "https://example.com/filing", occurred_at: daysAgo(between(2, 30)), ingested_at: daysAgo(between(0, 2)) },
  ]);
  await db.from("source_events").insert(events).then(({ error: e }) => { if (e) throw e; });
  await db.from("stage_history").insert((up ?? []).map((p) => ({
    project_id: p.id, stage: "fel2", confidence: 0.65,
    rationale: "Air permit + gas nomination pattern adjacent to DC load", inferred_by: "rules",
  }))).then(({ error: e }) => { if (e) throw e; });
  console.log(`Gas plants upserted: ${up?.length} (+${events.length} events)`);
}

if (process.argv.includes("--seed")) await seed();
else if (process.argv.includes("--live")) await live();
else if (process.argv.includes("--gas")) await addGas();
else console.log("Usage: bun scripts/simulate-feed.ts --seed | --live | --gas");
