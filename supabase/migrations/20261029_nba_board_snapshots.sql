-- NBA props board snapshot (docs/nba-hosted-props.md). NOT applied by the pull request that adds it.
-- One row, written by scripts/nba-snapshot-publish.ts and read by api/nba/props-board.ts, both with the service role.
-- The page is public, but the table is not: row level security is enabled and there is deliberately NO policy, so the anon
-- and authenticated roles (the key shipped in the browser bundle) can neither read nor write, and the Data API grants are
-- revoked as a second layer. Visitors only ever receive the snapshot through the function, already limited to the tier the
-- license records allow.
create table if not exists public.nba_board_snapshots (
  id text primary key,
  envelope jsonb not null,
  published_at timestamptz not null default now()
);

alter table public.nba_board_snapshots enable row level security;

revoke all on table public.nba_board_snapshots from anon, authenticated;
