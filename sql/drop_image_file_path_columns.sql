-- ============================================================
-- 기존 image_file_path / image_file_paths 컬럼 제거
-- (images + selection_images 테이블로 마이그레이션 완료 후)
-- ============================================================

ALTER TABLE public.collections DROP COLUMN IF EXISTS image_file_path;
ALTER TABLE public.selections_v2 DROP COLUMN IF EXISTS image_file_paths;
ALTER TABLE public.userinfo DROP COLUMN IF EXISTS image_file_path;
