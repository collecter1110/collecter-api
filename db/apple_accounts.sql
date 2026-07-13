create table public.apple_accounts (
  apple_user_id text not null,
  user_id integer not null,
  email text null,
  created_at timestamp with time zone null default now(),
  constraint apple_accounts_pkey primary key (apple_user_id),
  constraint apple_accounts_user_id_fkey foreign KEY (user_id) references userinfo (user_id) on delete CASCADE
) TABLESPACE pg_default;

-- Row Level Security: server(service_role) 전용. anon/authenticated 전면 차단.
-- service_role은 GRANT/RLS를 모두 우회하므로 백엔드 접근은 유지된다.
alter table public.apple_accounts enable row level security;
revoke all on table public.apple_accounts from anon, authenticated;
