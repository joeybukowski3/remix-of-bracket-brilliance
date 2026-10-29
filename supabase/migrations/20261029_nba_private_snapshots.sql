-- Hosted private NBA props snapshot (docs/nba-hosted-private-props.md). NOT applied by the pull request that adds it.
-- One row, written by scripts/nba-private-snapshot-publish.ts and read by api/nba/props-board.ts, both with the service role.
-- Row level security is enabled and there is deliberately NO policy: the anon and authenticated roles (the key shipped in
-- the browser bundle) can neither read nor write, and the Data API grants are revoked as a second layer.
create table if not exists public.nba_private_snapshots (
  id text primary key,
  envelope jsonb not null,
  published_at timestamptz not null default now()
);

alter table public.nba_private_snapshots enable row level security;

revoke all on table public.nba_private_snapshots from anon, authenticated;
