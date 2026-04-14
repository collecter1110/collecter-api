-- Local auth tables to replace Supabase Auth.
-- Apply this in your Supabase SQL editor (or migrations tool).

-- OTP intents (hashed codes)
create table if not exists public.auth_otp (
  id bigserial primary key,
  email text not null,
  code_hash text not null,
  create_user boolean not null default false,
  expires_at timestamptz not null,
  used_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists auth_otp_email_idx on public.auth_otp (email);
create index if not exists auth_otp_expires_idx on public.auth_otp (expires_at);

-- Refresh sessions (hashed refresh tokens)
create table if not exists public.auth_refresh_sessions (
  id uuid primary key,
  user_id bigint not null,
  email text not null,
  refresh_token_hash text not null unique,
  revoked_at timestamptz null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists auth_refresh_sessions_user_idx on public.auth_refresh_sessions (user_id);
create index if not exists auth_refresh_sessions_expires_idx on public.auth_refresh_sessions (expires_at);

