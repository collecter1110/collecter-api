-- Push notification foundation: device tokens + a last-seen signal.
--
-- Apply in Supabase SQL editor.

-- fcm_tokens -----------------------------------------------------------
-- fcm_token is globally unique, not unique per (user_id, fcm_token): one
-- device holds exactly one token, so when A logs out and B logs in on the
-- same handset FCM hands back the same token. Keying on the token alone lets
-- the upsert move the row to B instead of leaving two rows and pushing A's
-- notifications to B's phone.
create table if not exists public.fcm_tokens (
  id bigserial not null,
  user_id integer not null,
  fcm_token text not null,
  platform text not null,
  updated_at timestamptz not null default now(),
  constraint fcm_tokens_pkey primary key (id),
  constraint fcm_tokens_fcm_token_key unique (fcm_token),
  constraint fcm_tokens_platform_check check (platform in ('ios', 'android')),
  constraint fcm_tokens_user_id_fkey foreign key (user_id) references public.userinfo (user_id) on update cascade on delete cascade
);

create index if not exists fcm_tokens_user_id_idx on public.fcm_tokens using btree (user_id);

-- userinfo.last_active_at -------------------------------------------------
-- D7 ("7일간 안 들어왔을 때") has no signal to compute from without this.
-- Deliberately left NULL for existing rows rather than backfilled: seeding it
-- with now() would make every user in the table land on "마지막 접속이 정확히
-- 7일 전" simultaneously, 7 days after deploy, and blast the whole userbase.
-- NULL simply never matches the D7 window; real values appear as users return.
alter table public.userinfo
  add column if not exists last_active_at timestamptz;

create index if not exists userinfo_last_active_at_idx on public.userinfo using btree (last_active_at);

-- userinfo.push_enabled ---------------------------------------------------
-- The app's own notification toggle, not the OS permission. On iOS a denied
-- OS permission means no FCM token is ever issued, so those users are already
-- unreachable; this flag is for the user who granted permission and then
-- turned notifications off inside the app (and for Android, where a token can
-- exist while the OS permission is off). Defaults true so existing users keep
-- receiving push.
alter table public.userinfo
  add column if not exists push_enabled boolean not null default true;
