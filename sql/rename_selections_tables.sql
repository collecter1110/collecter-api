-- ============================================================
-- selections 테이블 이름 변경
-- selections → history_selections (기존 복합키 테이블)
-- selections_v2 → selections (새 단일키 테이블)
-- ============================================================

ALTER TABLE public.selections RENAME TO history_selections;
ALTER TABLE public.selections_v2 RENAME TO selections;
