-- Retention push send log + the per-day guardrail.
--
-- Apply in Supabase SQL editor.

create table if not exists public.push_logs (
  id bigserial not null,
  user_id integer not null,
  type text not null,
  sent_on date not null,
  created_at timestamptz not null default now(),
  constraint push_logs_pkey primary key (id),
  -- One push per user per day, full stop. Deliberately NOT keyed on type as
  -- well: a user could qualify for two types on the same day and the type
  -- column would happily let both go out.
  --
  -- Note this is the *daily* cap, not the "already sent" rule. The onboarding
  -- types are once-per-lifetime (checked by existence) while d3/d7 are
  -- once-per-dormancy-streak (checked against created_at vs the user's last
  -- selection), so a user legitimately has many rows here over time.
  constraint push_logs_user_id_sent_on_key unique (user_id, sent_on),
  constraint push_logs_type_check check (
    type in (
      'onboarding_no_collection',
      'onboarding_no_selection',
      'd3_no_record',
      'd7_dormant'
    )
  ),
  constraint push_logs_user_id_fkey foreign key (user_id) references public.userinfo (user_id) on update cascade on delete cascade
);

create index if not exists push_logs_sent_on_idx on public.push_logs using btree (sent_on);
create index if not exists push_logs_user_id_type_idx on public.push_logs using btree (user_id, type);
