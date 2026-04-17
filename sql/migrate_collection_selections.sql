-- ============================================================
-- collection_selections 매핑 테이블 마이그레이션
-- selections_v2에서 collection_id 제거, 다대다 매핑 테이블로 전환
-- 셀렉팅 시 셀렉션 복사 → 매핑 row 추가로 변경
-- ============================================================

-- ============================================================
-- Phase 1: collection_selections 테이블 생성
-- ============================================================

CREATE TABLE public.collection_selections (
  collection_id  integer      NOT NULL,
  selection_id   bigint       NOT NULL,
  user_id        integer      NOT NULL,
  created_at     timestamptz  NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul'),

  PRIMARY KEY (collection_id, selection_id),

  CONSTRAINT cs_collection_fkey
    FOREIGN KEY (collection_id) REFERENCES public.collections(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT cs_selection_fkey
    FOREIGN KEY (selection_id) REFERENCES public.selections_v2(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT cs_user_fkey
    FOREIGN KEY (user_id) REFERENCES public.userinfo(user_id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX cs_selection_id_idx ON public.collection_selections (selection_id);
CREATE INDEX cs_user_id_idx ON public.collection_selections (user_id);

-- ============================================================
-- Phase 2: 기존 데이터 마이그레이션
-- ============================================================

BEGIN;

-- 1) selections_v2의 기존 collection_id → collection_selections로 이동
INSERT INTO public.collection_selections (collection_id, selection_id, user_id, created_at)
SELECT
  s.collection_id,
  s.id,
  s.user_id,
  COALESCE(s.created_at::timestamptz, CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')
FROM public.selections_v2 s
WHERE s.collection_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 2) 셀렉팅으로 복사된 셀렉션 정리
--    is_selecting=true인 행은 복사본이므로, 원본 셀렉션을 해당 컬렉션에 매핑
--    그 후 복사본 행 삭제
INSERT INTO public.collection_selections (collection_id, selection_id, user_id, created_at)
SELECT
  sv.collection_id,
  sel.selected_selection_id,
  sel.selecting_user_id,
  sel.created_at
FROM public.selecting_v2 sel
JOIN public.selections_v2 sv ON sv.id = sel.selecting_selection_id
WHERE sel.selected_selection_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 복사본 셀렉션 삭제 (is_selecting=true인 것들)
-- CASCADE로 selection_images, selecting_v2도 같이 삭제됨
DELETE FROM public.selections_v2 WHERE is_selecting = true;

-- 3) selecting_v2 테이블 먼저 삭제 (selecting_uuid FK 의존성)
DROP TABLE IF EXISTS public.selecting_v2 CASCADE;

-- 4) selections_v2에서 더 이상 필요 없는 컬럼 제거
ALTER TABLE public.selections_v2 DROP CONSTRAINT IF EXISTS selections_v2_collection_user_fkey;
ALTER TABLE public.selections_v2 DROP COLUMN IF EXISTS collection_id;
ALTER TABLE public.selections_v2 DROP COLUMN IF EXISTS is_selecting;
ALTER TABLE public.selections_v2 DROP COLUMN IF EXISTS selecting_uuid;

COMMIT;

-- ============================================================
-- Phase 3: 트리거 업데이트
-- ============================================================

-- selection_num: collection_selections 기준으로 카운트
CREATE OR REPLACE FUNCTION update_selection_num_from_cs() RETURNS trigger AS $$
DECLARE target_collection_id integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_collection_id := OLD.collection_id;
  ELSE
    target_collection_id := NEW.collection_id;
  END IF;

  UPDATE public.collections
  SET selection_num = (
    SELECT count(*) FROM public.collection_selections
    WHERE collection_id = target_collection_id
  )
  WHERE id = target_collection_id;

  IF TG_OP = 'UPDATE' AND OLD.collection_id != NEW.collection_id THEN
    UPDATE public.collections
    SET selection_num = (
      SELECT count(*) FROM public.collection_selections
      WHERE collection_id = OLD.collection_id
    )
    WHERE id = OLD.collection_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_selection_num_v2_trigger ON public.selections_v2;

CREATE TRIGGER update_selection_num_cs_trigger
  AFTER INSERT OR DELETE OR UPDATE ON public.collection_selections
  FOR EACH ROW EXECUTE FUNCTION update_selection_num_from_cs();

-- primary_keywords: collection_selections 기준으로 키워드 집계
CREATE OR REPLACE FUNCTION update_primary_keywords_from_cs() RETURNS trigger AS $$
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
    FROM public.collection_selections cs
    JOIN public.selections_v2 s ON s.id = cs.selection_id
    , jsonb_array_elements(s.keywords) AS kw
    WHERE cs.collection_id = target_collection_id
      AND s.keywords IS NOT NULL
  )
  WHERE id = target_collection_id;

  IF TG_OP = 'UPDATE' AND OLD.collection_id != NEW.collection_id THEN
    UPDATE public.collections
    SET primary_keywords = (
      SELECT jsonb_agg(DISTINCT kw)
      FROM public.collection_selections cs
      JOIN public.selections_v2 s ON s.id = cs.selection_id
      , jsonb_array_elements(s.keywords) AS kw
      WHERE cs.collection_id = OLD.collection_id
        AND s.keywords IS NOT NULL
    )
    WHERE id = OLD.collection_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_primary_keywords_v2_trigger ON public.selections_v2;

CREATE TRIGGER update_primary_keywords_cs_trigger
  AFTER INSERT OR DELETE OR UPDATE ON public.collection_selections
  FOR EACH ROW EXECUTE FUNCTION update_primary_keywords_from_cs();

-- select_num: 셀렉션이 몇 번 셀렉팅 되었는지 (owner가 아닌 user가 추가한 횟수)
CREATE OR REPLACE FUNCTION update_select_num_from_cs() RETURNS trigger AS $$
DECLARE target_selection_id bigint;
        sel_owner_id integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_selection_id := OLD.selection_id;
  ELSE
    target_selection_id := NEW.selection_id;
  END IF;

  SELECT owner_id INTO sel_owner_id FROM public.selections_v2 WHERE id = target_selection_id;

  UPDATE public.selections_v2
  SET select_num = (
    SELECT count(*) FROM public.collection_selections
    WHERE selection_id = target_selection_id
      AND user_id != sel_owner_id
  )
  WHERE id = target_selection_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_select_num_cs_trigger
  AFTER INSERT OR DELETE ON public.collection_selections
  FOR EACH ROW EXECUTE FUNCTION update_select_num_from_cs();

-- ============================================================
-- Phase 4: 검증 쿼리
-- ============================================================

-- 매핑 테이블 row count
SELECT count(*) AS collection_selections_count FROM public.collection_selections;

-- 컬렉션별 selection_num 정합성 확인
SELECT c.id, c.selection_num, actual.cnt
FROM public.collections c
LEFT JOIN (
  SELECT collection_id, count(*) AS cnt
  FROM public.collection_selections
  GROUP BY collection_id
) actual ON actual.collection_id = c.id
WHERE c.selection_num != COALESCE(actual.cnt, 0)
LIMIT 10;

-- ============================================================
-- Phase 5: 정리 (모니터링 후 실행)
-- ============================================================

-- DROP TABLE IF EXISTS public.selecting_v2 CASCADE;
-- DROP FUNCTION IF EXISTS update_selection_num_in_collections_v2 CASCADE;
-- DROP FUNCTION IF EXISTS update_primary_keywords_v2_function CASCADE;
