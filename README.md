# collecter-api

## Supabase DB notes (Local Auth)

This project uses "Local Auth" (OTP + JWT) but still stores data in Supabase Postgres.

- Required tables: `public.auth_otp`, `public.auth_refresh_sessions` (see `sql/local_auth_tables.sql`)
- `public.userinfo.user_id` must be auto-generated (identity/serial). If you hit:
  - `null value in column "user_id" of relation "userinfo" violates not-null constraint`
  apply `sql/fix_userinfo_user_id.sql` in the Supabase SQL editor.
