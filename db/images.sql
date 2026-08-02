create table public.images (
  image_id uuid not null default gen_random_uuid (),
  file_path text not null,
  created_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone null,
  constraint images_pkey primary key (image_id)
) TABLESPACE pg_default;

create index IF not exists images_deleted_at_idx on public.images using btree (deleted_at) TABLESPACE pg_default;