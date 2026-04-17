-- ============================================================
-- collections.primary_keywords 집계 함수 수정
-- - 상위 3개 키워드만 집계 (빈도순)
-- - 각 항목에 count 필드 포함
-- - 결과 형식: [{"keyword_id": N, "keyword_name": "...", "count": M}, ...]
-- ============================================================

-- ------------------------------------------------------------
-- 1) 재사용 가능한 단일 계산 함수
--    collections.primary_keywords를 주어진 collection_id 기준으로 재계산
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION recompute_primary_keywords(target_collection_id integer)
RETURNS void AS $$
BEGIN
  UPDATE public.collections
  SET primary_keywords = COALESCE((
    SELECT jsonb_agg(x ORDER BY (x->>'count')::int DESC, (x->>'keyword_id')::int ASC)
    FROM (
      SELECT jsonb_build_object(
        'keyword_id',   (kw->>'keyword_id')::int,
        'keyword_name', kw->>'keyword_name',
        'count',        count(*)::int
      ) AS x
      FROM public.collection_selections cs
      JOIN public.selections s ON s.id = cs.selection_id,
           jsonb_array_elements(s.keywords) AS kw
      WHERE cs.collection_id = target_collection_id
        AND s.keywords IS NOT NULL
        AND jsonb_typeof(s.keywords) = 'array'
      GROUP BY (kw->>'keyword_id')::int, kw->>'keyword_name'
      ORDER BY count(*) DESC, (kw->>'keyword_id')::int ASC
      LIMIT 3
    ) t
  ), '[]'::jsonb)
  WHERE id = target_collection_id;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- 2) collection_selections 변경 시 호출될 트리거 함수
--    (기존 update_primary_keywords_from_cs 교체)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_primary_keywords_from_cs() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recompute_primary_keywords(OLD.collection_id);
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM recompute_primary_keywords(NEW.collection_id);
  ELSE -- UPDATE
    PERFORM recompute_primary_keywords(NEW.collection_id);
    IF OLD.collection_id IS DISTINCT FROM NEW.collection_id THEN
      PERFORM recompute_primary_keywords(OLD.collection_id);
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 트리거는 이미 정의되어 있으므로 재생성 불필요.
-- (CREATE OR REPLACE FUNCTION으로 기존 바인딩 유지)
--
-- 참고: selections.keywords가 PATCH로 수정되는 경우에는 collection_selections에
-- 변화가 없으므로 트리거가 발동하지 않아 primary_keywords가 일시적으로
-- stale 상태가 될 수 있음. 해당 컬렉션에 대한 다음 매핑 변경(INSERT/DELETE/UPDATE)
-- 시점에 전체 재집계되어 자동 복구되므로 의도적으로 허용함.

-- ------------------------------------------------------------
-- 3) (선택) 기존 데이터 일괄 재계산
-- ------------------------------------------------------------
-- 필요 시 주석 해제 후 실행:
-- DO $$
-- DECLARE cid integer;
-- BEGIN
--   FOR cid IN SELECT id FROM public.collections LOOP
--     PERFORM recompute_primary_keywords(cid);
--   END LOOP;
-- END $$;
