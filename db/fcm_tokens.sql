create table public.fcm_tokens (
  id bigserial not null,
  user_id integer not null,
  fcm_token text not null,
  platform text not null,
  updated_at timestamp with time zone not null default now(),
  constraint fcm_tokens_pkey primary key (id),
  constraint fcm_tokens_fcm_token_key unique (fcm_token),
  constraint fcm_tokens_platform_check check (
    platform = any (array['ios'::text, 'android'::text])
  ),
  constraint fcm_tokens_user_id_fkey foreign KEY (user_id) references userinfo (user_id) on update CASCADE on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists fcm_tokens_user_id_idx on public.fcm_tokens using btree (user_id) TABLESPACE pg_default;

-- Row Level Security: server(service_role) 전용. anon/authenticated 전면 차단.
-- service_role은 GRANT/RLS를 모두 우회하므로 백엔드 접근은 유지된다.
alter table public.fcm_tokens enable row level security;
revoke all on table public.fcm_tokens from anon, authenticated;
