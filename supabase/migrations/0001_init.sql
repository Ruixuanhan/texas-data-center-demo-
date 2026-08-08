-- Project Radar — data contract v1 (frozen at kickoff; columns are add-nullable-only from here)
-- Writers: ingestion pipeline + simulator (service role). Readers: frontend (anon, SELECT only).
-- Stage ladder: concept → fel1 → fel2 → feed → ia → fid → construction → cod (+ operational/canceled/unknown)

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,                -- ingestion upsert key
  name text not null,
  developer text,
  city text,
  county text,
  lat double precision,
  lon double precision,
  capacity_mw numeric,
  project_type text default 'data_center'
    check (project_type in ('data_center','gas_to_power','solar','wind','storage','other')),
  power_type text,
  current_stage text not null default 'unknown'
    check (current_stage in ('concept','fel1','fel2','feed','ia','fid','construction','cod','operational','canceled','unknown')),
  stage_confidence real check (stage_confidence between 0 and 1),
  headline text,                            -- latest signal one-liner for map/feed tooltips
  first_seen timestamptz default now(),
  last_activity timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists project_aliases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  alias text not null,
  alias_type text default 'press_name'
    check (alias_type in ('llc','permit_name','queue_name','docket_name','press_name','other')),
  confidence real check (confidence between 0 and 1),
  source text,
  created_at timestamptz default now()
);

create table if not exists source_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,  -- nullable: unattributed signals are a feature
  source text not null
    check (source in ('ercot_gis','ercot_rioo','ercot_mora','puct','ferc','tceq','rrc','county','municipal','press','earnings','oem_epc','cleanview','simulator','manual')),
  event_type text default 'filing'
    check (event_type in ('filing','permit','queue_update','docket','agenda','stage_change','news','earnings_mention','order','first_observed')),
  title text not null,
  summary text,
  url text,
  raw jsonb,
  severity text not null default 'low' check (severity in ('low','notable','major')),
  occurred_at timestamptz,
  ingested_at timestamptz not null default now()
);

create table if not exists stage_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  stage text not null
    check (stage in ('concept','fel1','fel2','feed','ia','fid','construction','cod','operational','canceled','unknown')),
  confidence real not null check (confidence between 0 and 1),
  rationale text,
  evidence_event_ids uuid[],
  inferred_by text default 'rules' check (inferred_by in ('rules','llm','human')),
  inferred_at timestamptz not null default now()
);

create index if not exists source_events_ingested_idx on source_events (ingested_at desc);
create index if not exists source_events_project_idx on source_events (project_id, occurred_at desc);
create index if not exists stage_history_project_idx on stage_history (project_id, inferred_at desc);
create index if not exists projects_stage_idx on projects (current_stage);

-- RLS: anon may read everything; writes require service role (bypasses RLS).
alter table projects enable row level security;
alter table project_aliases enable row level security;
alter table source_events enable row level security;
alter table stage_history enable row level security;

create policy "anon read projects"        on projects        for select using (true);
create policy "anon read aliases"         on project_aliases for select using (true);
create policy "anon read events"          on source_events   for select using (true);
create policy "anon read stage_history"   on stage_history   for select using (true);

-- Realtime: frontend subscribes to INSERTs on source_events (feed), stage_history (alerts),
-- and UPDATEs on projects (map restyle / KPI ticks).
alter publication supabase_realtime add table source_events;
alter publication supabase_realtime add table stage_history;
alter publication supabase_realtime add table projects;
