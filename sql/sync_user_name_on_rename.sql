-- ============================================================
-- collections.user_name / selections.owner_name 개명 전파
--
-- 이 두 컬럼은 조회 성능을 위한 userinfo.name 복사본인데
-- 이름 변경 시 갱신 경로가 없어 stale 상태로 남아 있었다.
-- (구 selections에 있던 (owner_id, owner_name) 복합 FK ON UPDATE CASCADE가
--  스키마 개편 과정에서 유실됨)
--
-- 해결: 복합 FK ON UPDATE CASCADE 복원.
--       이후 UPDATE userinfo SET name = ... 한 번으로 두 테이블이 함께 갱신된다.
--
-- 주의: INSERT 시 옛 이름이 들어오면 이 FK가 제약 위반을 낸다.
--       앱에서 JWT claims 대신 userinfo를 읽도록 함께 수정했다.
--       (src/lib/userInfo.ts getUserName)
-- ============================================================

-- ------------------------------------------------------------
-- 1) 기존 불일치 데이터 백필 (FK 생성 전 필수)
-- ------------------------------------------------------------
UPDATE public.collections c
SET user_name = u.name
FROM public.userinfo u
WHERE u.user_id = c.user_id
  AND u.name IS NOT NULL
  AND c.user_name IS DISTINCT FROM u.name;

UPDATE public.selections s
SET owner_name = u.name
FROM public.userinfo u
WHERE u.user_id = s.owner_id
  AND u.name IS NOT NULL
  AND s.owner_name IS DISTINCT FROM u.name;

-- ------------------------------------------------------------
-- 2) 개명 전파용 복합 FK
--    userinfo.unique_userid_username (user_id, name) 을 참조한다.
--    자식 컬럼이 둘 다 NOT NULL 이므로 MATCH SIMPLE 에서도 항상 검사된다.
-- ------------------------------------------------------------
ALTER TABLE public.collections
  DROP CONSTRAINT IF EXISTS collections_user_id_name_fkey;
ALTER TABLE public.collections
  ADD CONSTRAINT collections_user_id_name_fkey
  FOREIGN KEY (user_id, user_name) REFERENCES public.userinfo (user_id, name)
  ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.selections
  DROP CONSTRAINT IF EXISTS selections_owner_id_name_fkey;
ALTER TABLE public.selections
  ADD CONSTRAINT selections_owner_id_name_fkey
  FOREIGN KEY (owner_id, owner_name) REFERENCES public.userinfo (user_id, name)
  ON UPDATE CASCADE ON DELETE CASCADE;

-- ------------------------------------------------------------
-- 3) CASCADE가 탈 인덱스
--    자식 쪽 인덱스가 없으면 개명 1건마다 두 테이블을 seq scan 한다.
--    선두 컬럼 덕에 user_id / owner_id 단독 조회에도 쓰인다.
--    운영 DB에서 쓰기 잠금을 피하려면 트랜잭션 밖에서 CONCURRENTLY로 실행할 것.
-- ------------------------------------------------------------
create index if not exists collections_user_id_name_idx
  on public.collections using btree (user_id, user_name);

create index if not exists selections_owner_id_name_idx
  on public.selections using btree (owner_id, owner_name);
