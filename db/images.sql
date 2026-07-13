create table public.images (
  image_id uuid not null default gen_random_uuid (),
  file_path text not null,
  created_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone null,
  constraint images_pkey primary key (image_id)
) TABLESPACE pg_default;

create index IF not exists images_deleted_at_idx on public.images using btree (deleted_at) TABLESPACE pg_default;

-- Row Level Security: server(service_role) 전용. anon/authenticated 전면 차단.
-- service_role은 GRANT/RLS를 모두 우회하므로 백엔드 접근은 유지된다.
alter table public.images enable row level security;
revoke all on table public.images from anon, authenticated;
