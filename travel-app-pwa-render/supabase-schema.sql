create table if not exists public.trip_sync (
  sync_id uuid primary key,
  secret_hash text not null check (length(secret_hash) = 64),
  payload jsonb not null,
  revision bigint not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now()
);

alter table public.trip_sync enable row level security;

-- No browser policies are created. Only the server-side secret/service-role client
-- may access this table.
