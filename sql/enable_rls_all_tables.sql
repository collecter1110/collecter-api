-- Lock every table down to server-only (service_role) access.
--
-- Confirmed safe: the Flutter app and web both go through the backend API; no
-- client calls Supabase's Data API directly. So no anon/authenticated access is
-- needed anywhere, and service_role BYPASSES both GRANTs and RLS.
--
-- Two independent gates, because Supabase's Data API checks BOTH table
-- privileges (GRANT) and RLS. Belt and suspenders:
--   1. REVOKE strips the anon/authenticated roles' table privileges outright.
--   2. ENABLE RLS with no policy is a default-deny even if a GRANT lingers.
-- Enabling only RLS would still leave the privilege bit set; revoking only the
-- GRANT is the primary fix but RLS guards against a future GRANT slipping back.
--
-- Scope note: this is deny-ALL. It is correct only while every read/write goes
-- through the backend. If a client ever needs to hit a table directly, that
-- table needs its own policy instead — do not blanket-apply this to it.
--
-- Apply in Supabase SQL editor.

begin;

alter table public.userinfo               enable row level security;
alter table public.collections            enable row level security;
alter table public.selections             enable row level security;
alter table public.collection_selections  enable row level security;
alter table public.likes                  enable row level security;
alter table public.block                  enable row level security;
alter table public.images                 enable row level security;
alter table public.reports                enable row level security;
alter table public.fcm_tokens             enable row level security;
alter table public.push_logs              enable row level security;
alter table public.auth_otp               enable row level security;
alter table public.auth_refresh_sessions  enable row level security;
alter table public.apple_accounts         enable row level security;
alter table public.categoryinfo           enable row level security;
alter table public.keywordinfo            enable row level security;
alter table public.selection_images       enable row level security;

revoke all on table
  public.userinfo,
  public.collections,
  public.selections,
  public.collection_selections,
  public.likes,
  public.block,
  public.images,
  public.reports,
  public.fcm_tokens,
  public.push_logs,
  public.auth_otp,
  public.auth_refresh_sessions,
  public.apple_accounts,
  public.categoryinfo,
  public.keywordinfo,
  public.selection_images
from anon, authenticated;

commit;
