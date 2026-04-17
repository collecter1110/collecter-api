-- ============================================================
-- 구 테이블(history_selections) 트리거 및 select_num 관련 트리거 제거
-- ============================================================

-- 1) history_selections 테이블 트리거 제거
DROP TRIGGER IF EXISTS set_owner_name_before_insert ON public.history_selections;
DROP TRIGGER IF EXISTS trigger_set_selecting_uuid ON public.history_selections;
DROP TRIGGER IF EXISTS trigger_set_selection_id ON public.history_selections;
DROP TRIGGER IF EXISTS update_primary_keywords_trigger ON public.history_selections;
DROP TRIGGER IF EXISTS update_selection_num_trigger ON public.history_selections;

-- 2) select_num 컬럼 제거에 따른 트리거 제거
DROP TRIGGER IF EXISTS update_select_num_cs_trigger ON public.collection_selections;

-- 3) 더 이상 사용하지 않는 함수 제거
DROP FUNCTION IF EXISTS set_owner_name_in_selections();
DROP FUNCTION IF EXISTS generate_selecting_uuid();
DROP FUNCTION IF EXISTS set_selection_id();
DROP FUNCTION IF EXISTS update_primary_keywords_trigger_function();
DROP FUNCTION IF EXISTS update_selection_num_in_collections();
DROP FUNCTION IF EXISTS update_select_num_from_cs();
