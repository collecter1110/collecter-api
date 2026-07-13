create table public.selection_images (
  id bigserial not null,
  image_id uuid not null,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  selection_id bigint not null,
  constraint selection_images_pkey primary key (id),
  constraint selection_images_selection_id_image_id_key unique (selection_id, image_id),
  constraint selection_images_image_id_fkey foreign KEY (image_id) references images (image_id) on delete CASCADE,
  constraint selection_images_selection_fkey foreign KEY (selection_id) references selections (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists selection_images_selection_idx on public.selection_images using btree (selection_id) TABLESPACE pg_default;

create index IF not exists selection_images_image_idx on public.selection_images using btree (image_id) TABLESPACE pg_default;

-- Row Level Security: server(service_role) 전용. anon/authenticated 전면 차단.
-- service_role은 GRANT/RLS를 모두 우회하므로 백엔드 접근은 유지된다.
alter table public.selection_images enable row level security;
revoke all on table public.selection_images from anon, authenticated;
