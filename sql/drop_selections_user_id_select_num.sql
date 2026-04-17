-- ============================================================
-- selections: user_id, select_num 컬럼 제거
-- (owner_id를 유지, user_id는 항상 owner_id와 동일해야 함)
-- ============================================================

-- 1) 검증: owner_id != user_id인 행이 있으면 에러
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.selections WHERE owner_id != user_id) THEN
    RAISE EXCEPTION 'owner_id != user_id인 행이 존재합니다. 마이그레이션을 중단합니다.';
  END IF;
  RAISE NOTICE '검증 통과: 모든 행에서 owner_id = user_id';
END $$;

-- 2) collection_id + user_id 복합 FK 제거
ALTER TABLE public.selections DROP CONSTRAINT IF EXISTS selections_v2_collection_user_fkey;

-- 3) user_id, select_num 컬럼 제거
ALTER TABLE public.selections DROP COLUMN user_id;
ALTER TABLE public.selections DROP COLUMN select_num;

-- 4) select_num 관련 트리거 제거 (더 이상 사용하지 않음)
DROP TRIGGER IF EXISTS update_selection_num_v2_trigger ON public.selections;
DROP FUNCTION IF EXISTS update_selection_num_in_collections_v2();
