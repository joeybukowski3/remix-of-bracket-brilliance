create table if not exists public.live_brackets (
  season text primary key,
  payload jsonb not null,
  source text not null,
  is_complete boolean not null default false,
  validation jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default timezone('utc'::text, now()),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists live_brackets_is_complete_idx on public.live_brackets (is_complete);

create or replace function public.set_live_brackets_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists set_live_brackets_updated_at on public.live_brackets;

create trigger set_live_brackets_updated_at
before update on public.live_brackets
for each row
execute function public.set_live_brackets_updated_at();

alter table public.live_brackets disable row level security;
