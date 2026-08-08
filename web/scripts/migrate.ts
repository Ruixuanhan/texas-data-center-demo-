// Applies supabase/migrations/*.sql in order. Run: doppler run -- bun scripts/migrate.ts
// The direct db.<ref>.supabase.co host is IPv6-only; on IPv4 networks we rewrite the
// connection to the Supavisor session pooler (aws-N-<region>.pooler.supabase.com:5432),
// probing regions until the tenant is found.
import postgres from "postgres";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const raw = process.env.SUPABASE_DB_URL;
if (!raw) { console.error("SUPABASE_DB_URL missing"); process.exit(1); }
const direct = new URL(raw);
const ref = direct.hostname.startsWith("db.") ? direct.hostname.split(".")[1] : null;

async function connect(): Promise<ReturnType<typeof postgres>> {
  const candidates: string[] = [raw];
  if (ref) {
    for (const region of ["ca-central-1", "us-east-1", "us-east-2", "us-west-1", "us-west-2", "sa-east-1", "eu-west-1", "eu-central-1", "ap-south-1", "ap-southeast-1", "ap-northeast-1"]) {
      for (const n of [0, 1]) {
        for (const port of ["5432", "6543"]) {
          const u = new URL(raw);
          u.hostname = `aws-${n}-${region}.pooler.supabase.com`;
          u.port = port;
          u.username = `postgres.${ref}`;
          candidates.push(u.toString());
        }
      }
    }
  }
  for (const c of candidates) {
    const sql = postgres(c, { prepare: false, ssl: "require", connect_timeout: 6, max: 1 });
    try {
      await sql`select 1`;
      console.log(`connected via ${new URL(c).hostname}`);
      return sql;
    } catch (e: any) {
      await sql.end({ timeout: 1 }).catch(() => {});
      const u = new URL(c);
      console.log(`  ✗ ${u.hostname}:${u.port} — ${String(e?.message ?? e).slice(0, 80)}`);
    }
  }
  throw new Error("No reachable Postgres endpoint (direct or pooler) for this project");
}

const sql = await connect();
const dir = join(import.meta.dir, "../../supabase/migrations");
for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  console.log(`applying ${f}…`);
  await sql.unsafe(readFileSync(join(dir, f), "utf8"));
}
console.log("migrations applied");
await sql.end();
