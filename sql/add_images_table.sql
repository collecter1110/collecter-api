-- 1. images 테이블 생성
create table if not exists public.images (
  image_id   uuid primary key default gen_random_uuid(),
  file_path  text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create index if not exists images_deleted_at_idx on public.images (deleted_at);

-- 2. userinfo: image_id FK 추가 (기존 image_file_path 유지)
alter table public.userinfo
  add column if not exists image_id uuid null references public.images(image_id) on delete set null;

-- 3. collections: image_id FK 추가 (기존 image_file_path 유지)
alter table public.collections
  add column if not exists image_id uuid null references public.images(image_id) on delete set null;

-- 4. selection_images: selections 이미지 리스트를 위한 중간 테이블
--    selections PK가 (collection_id, selection_id) 복합키이므로 둘 다 참조
--    (기존 selections.image_file_paths 컬럼은 유지)
create table if not exists public.selection_images (
  id            bigserial primary key,
  collection_id integer not null,
  selection_id  integer not null,
  image_id      uuid    not null references public.images(image_id) on delete cascade,
  sort_order    int     not null default 0,
  created_at    timestamptz not null default now(),
  constraint selection_images_selection_fkey
    foreign key (collection_id, selection_id)
    references public.selections(collection_id, selection_id)
    on update cascade on delete cascade,
  unique (collection_id, selection_id, image_id)
);

create index if not exists selection_images_selection_idx on public.selection_images (collection_id, selection_id);
create index if not exists selection_images_image_idx     on public.selection_images (image_id);
