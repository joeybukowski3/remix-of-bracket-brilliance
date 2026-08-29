-- WU4: betting-splits persistence (historical source of truth).
--
-- Two tables:
--   1. betting_provider_game_crosswalks - durable provider event -> canonical JKB game identity.
--   2. betting_split_snapshots         - append-only change-based market observations.
--
-- Writes are server-side / service-role only. RLS is ENABLED with no policies so
-- anon + authenticated browser clients are denied by default; the service role
-- bypasses RLS. WU5 adds explicit SELECT policies (or a read-only API) if public
-- reads are needed.

-- ---------------------------------------------------------------------------
-- 1. Crosswalks
-- ---------------------------------------------------------------------------
create table if not exists public.betting_provider_game_crosswalks (
  id uuid primary key default gen_random_uuid(),
  league text not null check (league in ('nfl', 'cfb')),
  provider text not null,
  provider_game_id text not null,
  jkb_game_id text not null,

  provider_home_team_id text,
  provider_away_team_id text,
  canonical_home_team_id text,
  canonical_away_team_id text,

  first_verified_at timestamptz not null default timezone('utc'::text, now()),
  last_verified_at timestamptz not null default timezone('utc'::text, now()),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),

  -- Exactly one canonical mapping per provider event. A second row mapping the
  -- same provider event to a different JKB game is rejected by the DB, matching
  -- the "fail closed on conflict" store semantics.
  constraint betting_provider_game_crosswalks_identity_key
    unique (league, provider, provider_game_id)
);

create index if not exists betting_provider_game_crosswalks_jkb_game_idx
  on public.betting_provider_game_crosswalks (league, jkb_game_id);

-- ---------------------------------------------------------------------------
-- 2. Snapshots
-- ---------------------------------------------------------------------------
create table if not exists public.betting_split_snapshots (
  id uuid primary key default gen_random_uuid(),
  schema_version text not null,

  league text not null check (league in ('nfl', 'cfb')),
  season integer not null,
  week integer,
  jkb_game_id text not null,

  home_team_id text not null,
  away_team_id text not null,
  kickoff_utc timestamptz,

  provider text not null,
  provider_game_id text not null,
  -- '' is the deterministic representation of "provider consensus / no book".
  sportsbook text not null default '',

  captured_at timestamptz not null,
  provider_created_at timestamptz,
  provider_last_seen_at timestamptz,

  -- Market state. JSONB (not one column per number): the three markets are always
  -- read together as a unit, the shape is stable and already schema-validated in
  -- app code (WU1 zod), and every planned query filters/orders by the identity +
  -- time columns below rather than by an individual market number. JSONB keeps the
  -- three optional blocks nullable without 20+ nullable columns and lets the line /
  -- bet% / money% history selectors project what they need. Aggregates over a single
  -- field (e.g. spread line history) use `(spread->>'currentHomeLine')::numeric`.
  spread jsonb,
  total jsonb,
  moneyline jsonb,

  content_hash text not null,

  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),

  constraint betting_split_snapshots_observation_window_ck
    check (last_observed_at >= first_observed_at),
  constraint betting_split_snapshots_distinct_teams_ck
    check (home_team_id <> away_team_id),
  -- Chronological identity: at most one observation per market series
  -- (league, jkb_game_id, provider, sportsbook) can START at a given instant.
  -- History is change-based, so a state that returns to an earlier value
  -- (A -> B -> A) is a NEW observation with its own first_observed_at.
  -- content_hash is therefore NOT globally unique across a series; dedup is an
  -- application concern (storeBettingSplitSnapshot compares only the latest row).
  -- A DraftKings row can never collide with FanDuel / consensus / another provider
  -- because all three are in the key.
  constraint betting_split_snapshots_series_start_key
    unique (league, jkb_game_id, provider, sportsbook, first_observed_at)
);

-- latest snapshot for game/provider/book, and full ordered history for that series.
create index if not exists betting_split_snapshots_series_time_idx
  on public.betting_split_snapshots (jkb_game_id, provider, sportsbook, first_observed_at desc);

-- all snapshots for a game ordered by time (cross-provider line history).
create index if not exists betting_split_snapshots_game_time_idx
  on public.betting_split_snapshots (jkb_game_id, first_observed_at desc);

-- current weekly slate.
create index if not exists betting_split_snapshots_slate_idx
  on public.betting_split_snapshots (league, season, week);

-- provider event lookup (join back to crosswalks / provider debugging).
create index if not exists betting_split_snapshots_provider_event_idx
  on public.betting_split_snapshots (provider, provider_game_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers (repo convention: see 20260315_create_live_brackets.sql)
-- ---------------------------------------------------------------------------
create or replace function public.set_betting_split_storage_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists set_betting_provider_game_crosswalks_updated_at
  on public.betting_provider_game_crosswalks;
create trigger set_betting_provider_game_crosswalks_updated_at
before update on public.betting_provider_game_crosswalks
for each row
execute function public.set_betting_split_storage_updated_at();

drop trigger if exists set_betting_split_snapshots_updated_at
  on public.betting_split_snapshots;
create trigger set_betting_split_snapshots_updated_at
before update on public.betting_split_snapshots
for each row
execute function public.set_betting_split_storage_updated_at();

-- ---------------------------------------------------------------------------
-- Security: deny-by-default. Service role bypasses RLS for the collector.
-- ---------------------------------------------------------------------------
alter table public.betting_provider_game_crosswalks enable row level security;
alter table public.betting_split_snapshots enable row level security;
