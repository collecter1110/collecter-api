-- ============================================================
-- images / selection_images 데이터 전체 제거
-- ============================================================
-- 순서: FK 참조 해제 → selection_images 삭제 → images 삭제

BEGIN;

-- 1) userinfo, collections의 image_id FK를 NULL로 초기화
UPDATE public.userinfo SET image_id = NULL WHERE image_id IS NOT NULL;
UPDATE public.collections SET image_id = NULL WHERE image_id IS NOT NULL;

-- 2) selection_images 전체 삭제
DELETE FROM public.selection_images;

-- 3) images 전체 삭제
DELETE FROM public.images;

COMMIT;

-- 검증
SELECT 'images' AS tbl, count(*) FROM public.images
UNION ALL SELECT 'selection_images', count(*) FROM public.selection_images
UNION ALL SELECT 'userinfo (image_id NOT NULL)', count(*) FROM public.userinfo WHERE image_id IS NOT NULL
UNION ALL SELECT 'collections (image_id NOT NULL)', count(*) FROM public.collections WHERE image_id IS NOT NULL;
