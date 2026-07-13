-- Remove three legacy selecting-feature objects:
--   _selecting     (table, 21 rows)
--   _selections    (table, 817 rows)
--   selectingview  (view,  805 rows)
--
-- These are leftovers from an old selecting implementation. No keeper table
-- has a foreign key to them (verified against db/*.sql snapshots) and no server
-- code reads them.
--
-- !!! NEVER use DROP ... CASCADE here. CASCADE would silently drop whatever
-- depends on these — including, in the worst case, constraints or objects on
-- the live selections/collections tables. Everything below uses the default
-- RESTRICT, so Postgres REFUSES and tells you what is attached instead of
-- destroying it. If a DROP errors, stop and inspect — do not add CASCADE.
--
-- Apply in Supabase SQL editor. Run STEP 1 first and read the output.


-- ============================================================
-- STEP 1 — inspect dependencies FIRST (authoritative, reads pg_catalog).
-- Run this alone. Expect ZERO rows (aside from the view depending on the
-- tables, which is fine and handled by dropping the view first). Any OTHER
-- dependent — a foreign key from a keeper table, a trigger, a function's
-- rewrite rule — shows up here. If anything unexpected appears, STOP.
-- ============================================================

-- 1a. Foreign keys pointing AT these objects (would block a RESTRICT drop):
select
  con.conname        as constraint_name,
  src.relname        as referencing_table,
  tgt.relname        as referenced_object
from pg_constraint con
join pg_class src on src.oid = con.conrelid
join pg_class tgt on tgt.oid = con.confrelid
where con.contype = 'f'
  and tgt.relname in ('_selecting', '_selections', 'selectingview');

-- 1b. Everything else that depends on them (views, rules, triggers, columns):
select
  dep.relname        as dependent_object,
  dep.relkind        as kind,   -- r=table, v=view, m=matview, ...
  tgt.relname        as depends_on
from pg_depend d
join pg_rewrite rw on rw.oid = d.objid
join pg_class dep on dep.oid = rw.ev_class
join pg_class tgt on tgt.oid = d.refobjid
where tgt.relname in ('_selecting', '_selections', 'selectingview')
  and dep.relname not in ('_selecting', '_selections', 'selectingview')
group by dep.relname, dep.relkind, tgt.relname;


-- ============================================================
-- STEP 2 — drop, only after STEP 1 came back clean.
-- View first (it reads the tables), then the tables. RESTRICT is the default;
-- it is written explicitly here as a reminder that CASCADE is forbidden.
-- ============================================================

begin;

drop view if exists public.selectingview;   -- implicitly RESTRICT
drop table if exists public._selecting  restrict;
drop table if exists public._selections restrict;

commit;
