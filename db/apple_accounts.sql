create table public.apple_accounts (
  apple_user_id text not null,
  user_id integer not null,
  email text null,
  created_at timestamp with time zone null default now(),
  constraint apple_accounts_pkey primary key (apple_user_id),
  constraint apple_accounts_user_id_fkey foreign KEY (user_id) references userinfo (user_id) on delete CASCADE
) TABLESPACE pg_default;