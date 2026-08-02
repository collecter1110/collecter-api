create table public.reports (
  id uuid not null default gen_random_uuid (),
  report_reason text not null,
  reporter_user_id bigint not null,
  reported_post_id jsonb not null,
  created_at timestamp with time zone not null default now(),
  status boolean not null default false,
  report_type smallint not null,
  constraint report_pkey primary key (id),
  constraint reports_reporter_user_id_fkey foreign KEY (reporter_user_id) references userinfo (user_id) on update CASCADE on delete CASCADE
) TABLESPACE pg_default;