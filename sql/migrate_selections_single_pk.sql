-- ============================================================
-- 셀렉션 단일 PK 마이그레이션
-- selections (collection_id, selection_id) 복합키 → selections_v2 (id) 단일 PK
-- ============================================================

-- ============================================================
-- Phase 1: 새 테이블 생성
-- ============================================================

-- 1-1. selections_v2
CREATE TABLE public.selections_v2 (
  id              bigserial    PRIMARY KEY,
  collection_id   integer      NOT NULL,
  user_id         integer      NOT NULL,
  owner_id        integer      NOT NULL,
  category_id     integer      NOT NULL DEFAULT 0,
  title           text         NOT NULL,
  description     text,
  keywords        jsonb,
  link            text,
  items           jsonb,
  is_ordered      boolean      NOT NULL DEFAULT false,
  is_selectable   boolean      NOT NULL DEFAULT false,
  is_selecting    boolean      DEFAULT false,
  selecting_uuid  uuid         UNIQUE DEFAULT gen_random_uuid(),
  owner_name      text         NOT NULL,
  select_num      integer      NOT NULL DEFAULT 0,
  image_file_paths text[],
  created_at      date         NOT NULL DEFAULT CURRENT_DATE,

  CONSTRAINT selections_v2_collection_user_fkey
    FOREIGN KEY (collection_id, user_id)
    REFERENCES public.collections(id, user_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT selections_v2_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES public.userinfo(user_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT selections_v2_owner_id_name_fkey
    FOREIGN KEY (owner_id, owner_name) REFERENCES public.userinfo(user_id, name)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT selections_v2_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES public.categoryinfo(category_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT check_items_format_v2 CHECK (items IS NULL OR validate_items_format(items)),
  CONSTRAINT check_keywords_format_v2 CHECK (keywords IS NULL OR validate_keywords_format(keywords))
);

CREATE INDEX selections_v2_collection_id_idx ON public.selections_v2 (collection_id);
CREATE INDEX selections_v2_keywords_gin_idx ON public.selections_v2 USING gin (keywords jsonb_path_ops);

-- 1-2. selecting_v2
CREATE TABLE public.selecting_v2 (
  uuid                      uuid PRIMARY KEY,
  selecting_selection_id    bigint  NOT NULL REFERENCES public.selections_v2(id) ON UPDATE CASCADE ON DELETE CASCADE,
  selecting_user_id         bigint  NOT NULL,
  selecting_collection_id   bigint  NOT NULL,
  selected_selection_id     bigint,
  selected_user_id          bigint,
  selected_collection_id    bigint,
  created_at                timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul'),

  CONSTRAINT selecting_v2_uuid_fkey
    FOREIGN KEY (uuid) REFERENCES public.selections_v2(selecting_uuid) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX selecting_v2_selecting_user_idx ON public.selecting_v2 (selecting_user_id);
CREATE INDEX selecting_v2_selected_user_idx ON public.selecting_v2 (selected_user_id);

-- 1-3. 트리거 재생성 (selections_v2 대상)

-- set_owner_name: INSERT 시 owner_id로 userinfo.name 조회
CREATE OR REPLACE FUNCTION set_owner_name_in_selections_v2() RETURNS trigger AS $$
BEGIN
  SELECT name INTO NEW.owner_name FROM public.userinfo WHERE user_id = NEW.owner_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_owner_name_before_insert_v2
  BEFORE INSERT ON public.selections_v2
  FOR EACH ROW EXECUTE FUNCTION set_owner_name_in_selections_v2();

-- update_selection_num: INSERT/DELETE/UPDATE 시 collections.selection_num 갱신
CREATE OR REPLACE FUNCTION update_selection_num_in_collections_v2() RETURNS trigger AS $$
DECLARE target_collection_id integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_collection_id := OLD.collection_id;
  ELSE
    target_collection_id := NEW.collection_id;
  END IF;

  UPDATE public.collections
  SET selection_num = (
    SELECT count(*) FROM public.selections_v2 WHERE collection_id = target_collection_id
  )
  WHERE id = target_collection_id;

  -- UPDATE로 collection_id가 변경된 경우 (move) 이전 컬렉션도 갱신
  IF TG_OP = 'UPDATE' AND OLD.collection_id != NEW.collection_id THEN
    UPDATE public.collections
    SET selection_num = (
      SELECT count(*) FROM public.selections_v2 WHERE collection_id = OLD.collection_id
    )
    WHERE id = OLD.collection_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_selection_num_v2_trigger
  AFTER INSERT OR DELETE OR UPDATE ON public.selections_v2
  FOR EACH ROW EXECUTE FUNCTION update_selection_num_in_collections_v2();

-- update_primary_keywords: selections_v2 대상으로 키워드 집계 갱신
CREATE OR REPLACE FUNCTION update_primary_keywords_v2_function() RETURNS trigger AS $$
DECLARE target_collection_id integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_collection_id := OLD.collection_id;
  ELSE
    target_collection_id := NEW.collection_id;
  END IF;

  UPDATE public.collections
  SET primary_keywords = (
    SELECT jsonb_agg(DISTINCT kw)
    FROM public.selections_v2,
         jsonb_array_elements(keywords) AS kw
    WHERE collection_id = target_collection_id
      AND keywords IS NOT NULL
  )
  WHERE id = target_collection_id;

  IF TG_OP = 'UPDATE' AND OLD.collection_id != NEW.collection_id THEN
    UPDATE public.collections
    SET primary_keywords = (
      SELECT jsonb_agg(DISTINCT kw)
      FROM public.selections_v2,
           jsonb_array_elements(keywords) AS kw
      WHERE collection_id = OLD.collection_id
        AND keywords IS NOT NULL
    )
    WHERE id = OLD.collection_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_primary_keywords_v2_trigger
  AFTER INSERT OR DELETE OR UPDATE ON public.selections_v2
  FOR EACH ROW EXECUTE FUNCTION update_primary_keywords_v2_function();

-- generate_selecting_uuid: 컬럼 DEFAULT (gen_random_uuid())로 대체, 트리거 불필요
-- set_selection_id: 삭제 (더 이상 collection 내 순차 ID 불필요)

-- ============================================================
-- Phase 2: 데이터 마이그레이션
-- ============================================================

BEGIN;

-- 1) selections → selections_v2
INSERT INTO public.selections_v2 (
  collection_id, user_id, owner_id, category_id, title, description,
  keywords, link, items, is_ordered, is_selectable, is_selecting,
  selecting_uuid, owner_name, select_num, image_file_paths, created_at
)
SELECT
  collection_id, user_id, owner_id, category_id, title, description,
  keywords, link, items, is_ordered, is_selectable, is_selecting,
  selecting_uuid, owner_name, select_num, image_file_paths, created_at
FROM public.selections
ORDER BY collection_id, selection_id;

-- 2) 매핑 테이블 생성 (selecting_uuid 기준 — 고유하므로 안전)
CREATE TEMP TABLE selection_id_map AS
SELECT
  s.collection_id AS old_collection_id,
  s.selection_id  AS old_selection_id,
  v2.id           AS new_id
FROM public.selections s
JOIN public.selections_v2 v2 ON v2.selecting_uuid = s.selecting_uuid;

-- 3) selection_images ALTER: 새 컬럼 추가 및 데이터 매핑
ALTER TABLE public.selection_images ADD COLUMN new_selection_id bigint;

UPDATE public.selection_images si
SET new_selection_id = m.new_id
FROM selection_id_map m
WHERE m.old_collection_id = si.collection_id
  AND m.old_selection_id  = si.selection_id;

-- 매핑되지 않은 orphaned 레코드 삭제 (대응하는 selection이 없는 이미지)
DELETE FROM public.selection_images WHERE new_selection_id IS NULL;

-- 기존 복합 FK 삭제
ALTER TABLE public.selection_images DROP CONSTRAINT selection_images_selection_fkey;
-- 기존 복합 unique 삭제
ALTER TABLE public.selection_images DROP CONSTRAINT selection_images_collection_id_selection_id_image_id_key;
-- 기존 인덱스 삭제
DROP INDEX IF EXISTS selection_images_selection_idx;
-- 기존 컬럼 삭제
ALTER TABLE public.selection_images DROP COLUMN collection_id;
ALTER TABLE public.selection_images DROP COLUMN selection_id;
-- 새 컬럼 이름 변경
ALTER TABLE public.selection_images RENAME COLUMN new_selection_id TO selection_id;
-- NOT NULL 제약 추가
ALTER TABLE public.selection_images ALTER COLUMN selection_id SET NOT NULL;
-- 새 FK 추가 (selections_v2.id 참조)
ALTER TABLE public.selection_images
  ADD CONSTRAINT selection_images_selection_fkey
  FOREIGN KEY (selection_id) REFERENCES public.selections_v2(id)
  ON DELETE CASCADE;
-- 새 unique 제약 추가
ALTER TABLE public.selection_images
  ADD CONSTRAINT selection_images_selection_id_image_id_key
  UNIQUE (selection_id, image_id);
-- 새 인덱스 생성
CREATE INDEX selection_images_selection_idx ON public.selection_images (selection_id);

-- 4) selecting → selecting_v2
INSERT INTO public.selecting_v2 (
  uuid, selecting_selection_id, selecting_user_id, selecting_collection_id,
  selected_selection_id, selected_user_id, selected_collection_id, created_at
)
SELECT
  sel.uuid,
  m_ing.new_id,
  sel.selecting_user_id,
  sel.selecting_collection_id,
  m_ed.new_id,
  sel.selected_user_id,
  sel.selected_collection_id,
  sel.created_at
FROM public.selecting sel
JOIN selection_id_map m_ing
  ON m_ing.old_collection_id = sel.selecting_collection_id
 AND m_ing.old_selection_id  = sel.selecting_selection_id
LEFT JOIN selection_id_map m_ed
  ON m_ed.old_collection_id = sel.selected_collection_id
 AND m_ed.old_selection_id  = sel.selected_selection_id;

DROP TABLE selection_id_map;

COMMIT;

-- ============================================================
-- 검증 쿼리 (마이그레이션 후 실행)
-- ============================================================

-- row count 비교
SELECT 'selections' AS tbl, count(*) FROM selections
UNION ALL SELECT 'selections_v2', count(*) FROM selections_v2
UNION ALL SELECT 'selection_images', count(*) FROM selection_images
UNION ALL SELECT 'selecting', count(*) FROM selecting
UNION ALL SELECT 'selecting_v2', count(*) FROM selecting_v2;

-- selection_images의 selection_id가 모두 NOT NULL인지 확인
SELECT count(*) AS null_selection_ids FROM selection_images WHERE selection_id IS NULL;

-- ============================================================
-- Phase 4: 정리 (모니터링 후 실행)
-- ============================================================

-- DROP TABLE IF EXISTS public.selecting CASCADE;
-- DROP TABLE IF EXISTS public.selections CASCADE;
-- ALTER TABLE public.selections_v2 RENAME TO selections;
-- ALTER TABLE public.selecting_v2 RENAME TO selecting;
