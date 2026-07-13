create table public.auth_refresh_sessions (
  id uuid not null,
  user_id bigint not null,
  email text not null,
  refresh_token_hash text not null,
  revoked_at timestamp with time zone null,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone not null default now(),
  constraint auth_refresh_sessions_pkey primary key (id),
  constraint auth_refresh_sessions_refresh_token_hash_key unique (refresh_token_hash)
) TABLESPACE pg_default;

create index IF not exists auth_refresh_sessions_user_idx on public.auth_refresh_sessions using btree (user_id) TABLESPACE pg_default;

create index IF not exists auth_refresh_sessions_expires_idx on public.auth_refresh_sessions using btree (expires_at) TABLESPACE pg_default;

-- Row Level Security: server(service_role) 전용. anon/authenticated 전면 차단.
-- service_role은 GRANT/RLS를 모두 우회하므로 백엔드 접근은 유지된다.
alter table public.auth_refresh_sessions enable row level security;
revoke all on table public.auth_refresh_sessions from anon, authenticated;
