-- Soft delete support for users.
-- Apply in Supabase SQL editor (or migrations tool).

alter table public.userinfo
  add column if not exists deleted_at timestamptz null;

create index if not exists userinfo_deleted_at_idx on public.userinfo (deleted_at);

