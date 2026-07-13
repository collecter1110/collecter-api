create table public.push_logs (
  id bigserial not null,
  user_id integer not null,
  type text not null,
  sent_on date not null,
  created_at timestamp with time zone not null default now(),
  constraint push_logs_pkey primary key (id),
  constraint push_logs_user_id_sent_on_key unique (user_id, sent_on),
  constraint push_logs_type_check check (
    type = any (
      array[
        'onboarding_no_collection'::text,
        'onboarding_no_selection'::text,
        'd3_no_record'::text,
        'd7_dormant'::text
      ]
    )
  ),
  constraint push_logs_user_id_fkey foreign KEY (user_id) references userinfo (user_id) on update CASCADE on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists push_logs_sent_on_idx on public.push_logs using btree (sent_on) TABLESPACE pg_default;

create index IF not exists push_logs_user_id_type_idx on public.push_logs using btree (user_id, type) TABLESPACE pg_default;

-- Row Level Security: server(service_role) 전용. anon/authenticated 전면 차단.
-- service_role은 GRANT/RLS를 모두 우회하므로 백엔드 접근은 유지된다.
alter table public.push_logs enable row level security;
revoke all on table public.push_logs from anon, authenticated;
