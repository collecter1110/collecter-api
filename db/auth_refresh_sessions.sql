create table public.auth_refresh_sessions (
  id uuid not null,
  user_id bigint not null,
  email text not null,
  refresh_token_hash text not null,
  revoked_at timestamp with time zone null,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone not null default now(),
  rotated_at timestamp with time zone null,
  chain_id uuid null,
  constraint auth_refresh_sessions_pkey primary key (id),
  constraint auth_refresh_sessions_refresh_token_hash_key unique (refresh_token_hash)
) TABLESPACE pg_default;

create index IF not exists auth_refresh_sessions_chain_idx on public.auth_refresh_sessions using btree (chain_id) TABLESPACE pg_default;

create index IF not exists auth_refresh_sessions_user_idx on public.auth_refresh_sessions using btree (user_id) TABLESPACE pg_default;

create index IF not exists auth_refresh_sessions_expires_idx on public.auth_refresh_sessions using btree (expires_at) TABLESPACE pg_default;