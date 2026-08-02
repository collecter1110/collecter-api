create table public.selections (
  id bigserial not null,
  owner_id integer not null,
  category_id integer not null default 0,
  title text not null,
  description text null,
  keywords jsonb null,
  link text null,
  items jsonb null,
  is_ordered boolean not null default false,
  is_selectable boolean not null default false,
  owner_name text not null,
  created_at timestamp with time zone not null default now(),
  constraint selections_v2_pkey primary key (id),
  constraint selections_owner_id_fkey foreign KEY (owner_id) references userinfo (user_id) on update CASCADE on delete CASCADE,
  constraint selections_owner_id_name_fkey foreign KEY (owner_id, owner_name) references userinfo (user_id, name) on update CASCADE on delete CASCADE,
  constraint selections_v2_category_id_fkey foreign KEY (category_id) references categoryinfo (category_id) on update CASCADE on delete CASCADE,
  constraint check_items_format_v2 check (
    (
      (items is null)
      or validate_items_format (items)
    )
  ),
  constraint check_keywords_format_v2 check (
    (
      (keywords is null)
      or validate_keywords_format (keywords)
    )
  )
) TABLESPACE pg_default;

create index IF not exists selections_owner_id_name_idx on public.selections using btree (owner_id, owner_name) TABLESPACE pg_default;

create index IF not exists selections_v2_keywords_gin_idx on public.selections using gin (keywords jsonb_path_ops) TABLESPACE pg_default;