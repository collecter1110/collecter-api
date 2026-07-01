create table public.collection_selections (
  collection_id integer not null,
  selection_id bigint not null,
  user_id integer not null,
  created_at timestamp with time zone not null default (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul'::text),
  constraint collection_selections_pkey primary key (collection_id, selection_id),
  constraint cs_collection_fkey foreign KEY (collection_id) references collections (id) on update CASCADE on delete CASCADE,
  constraint cs_selection_fkey foreign KEY (selection_id) references selections (id) on update CASCADE on delete CASCADE,
  constraint cs_user_fkey foreign KEY (user_id) references userinfo (user_id) on update CASCADE on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists cs_selection_id_idx on public.collection_selections using btree (selection_id) TABLESPACE pg_default;

create index IF not exists cs_user_id_idx on public.collection_selections using btree (user_id) TABLESPACE pg_default;

create trigger update_primary_keywords_cs_trigger
after INSERT
or DELETE
or
update on collection_selections for EACH row
execute FUNCTION update_primary_keywords_from_cs ();