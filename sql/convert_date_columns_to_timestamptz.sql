-- Store full time + timezone for created/liked timestamps.
--
-- Only these columns are NOT already timestamptz:
--   collections.created_at  : date  (default CURRENT_DATE)
--   selections.created_at   : date  (default CURRENT_DATE)
--   userinfo.created_at     : date  (default CURRENT_DATE)
--   likes.liked_at          : timestamp WITHOUT time zone (default CURRENT_TIMESTAMP)
--
-- Everything else (apple_accounts, auth_otp, auth_refresh_sessions, block,
-- collection_selections, images, reports, selection_images, userinfo.deleted_at)
-- is already `timestamp with time zone` and is left untouched.
--
-- Apply in Supabase SQL editor.

-- collections.created_at -------------------------------------------------
-- Existing date rows are interpreted as midnight KST so the calendar date
-- is preserved when displayed in Korea.
alter table public.collections
  alter column created_at type timestamptz
    using ((created_at::timestamp) at time zone 'Asia/Seoul'),
  alter column created_at set default now();

-- selections.created_at --------------------------------------------------
alter table public.selections
  alter column created_at type timestamptz
    using ((created_at::timestamp) at time zone 'Asia/Seoul'),
  alter column created_at set default now();

-- userinfo.created_at ----------------------------------------------------
alter table public.userinfo
  alter column created_at type timestamptz
    using ((created_at::timestamp) at time zone 'Asia/Seoul'),
  alter column created_at set default now();

-- likes.liked_at ---------------------------------------------------------
-- Existing values were stored by CURRENT_TIMESTAMP on a UTC server, i.e. the
-- UTC wall-clock with no offset, so re-interpret them as UTC (no shift).
alter table public.likes
  alter column liked_at type timestamptz
    using (liked_at at time zone 'UTC'),
  alter column liked_at set default now();

-- collection_selections.created_at ---------------------------------------
-- Already timestamptz, BUT it was filled by `CURRENT_TIMESTAMP AT TIME ZONE
-- 'Asia/Seoul'`, which stored the Seoul wall-clock labelled as +00 (i.e. 9h
-- ahead of the true instant). Re-read the stored wall-clock as KST to recover
-- the real UTC instant, and switch the default to a plain now() so new rows
-- are stored as true UTC.
alter table public.collection_selections
  alter column created_at type timestamptz
    using ((created_at::timestamp) at time zone 'Asia/Seoul'),
  alter column created_at set default now();
