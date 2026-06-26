create table public.keywordinfo (
  keyword_id serial not null,
  keyword_name character varying(255) not null,
  category_id integer not null default 0,
  constraint keywordinfo_pkey primary key (keyword_id),
  constraint keywordinfo_category_id_keyword_name_key unique (category_id, keyword_name),
  constraint keywordinfo_keyword_id_key unique (keyword_id),
  constraint keywordinfo_category_id_fkey foreign KEY (category_id) references categoryinfo (category_id) on update CASCADE on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_keywordinfo_id on public.keywordinfo using btree (keyword_id) TABLESPACE pg_default;

create index IF not exists idx_keywordinfo_name on public.keywordinfo using btree (keyword_name) TABLESPACE pg_default;