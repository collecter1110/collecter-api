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

create trigger trigger_delete_report_post
after
update OF status on reports for EACH row when (new.status = true)
execute FUNCTION delete_report_post ();

-- Row Level Security: server(service_role) 전용. anon/authenticated 전면 차단.
-- service_role은 GRANT/RLS를 모두 우회하므로 백엔드 접근은 유지된다.
alter table public.reports enable row level security;
revoke all on table public.reports from anon, authenticated;
