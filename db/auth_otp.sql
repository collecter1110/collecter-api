create table public.auth_otp (
  id bigserial not null,
  email text not null,
  code_hash text not null,
  create_user boolean not null default false,
  expires_at timestamp with time zone not null,
  used_at timestamp with time zone null,
  created_at timestamp with time zone not null default now(),
  constraint auth_otp_pkey primary key (id)
) TABLESPACE pg_default;

create index IF not exists auth_otp_email_idx on public.auth_otp using btree (email) TABLESPACE pg_default;

create index IF not exists auth_otp_expires_idx on public.auth_otp using btree (expires_at) TABLESPACE pg_default;