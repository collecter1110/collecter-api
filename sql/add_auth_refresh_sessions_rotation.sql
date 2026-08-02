-- 갱신 토큰 로테이션에 유예 창을 도입한다.
--
-- rotated_at: 갱신으로 대체된 시점. revoked_at(로그아웃 폐기)과 분리해야 한다.
--   하나로 합치면 "폐기 후 N초는 봐준다" 규칙이 로그아웃한 세션까지 되살린다.
-- chain_id: 로그인 한 번에서 파생된 회전 세션들의 묶음. 유예 창 안의 동시 갱신은
--   각각 새 세션을 만들기 때문에, 로그아웃이 체인 전체를 폐기해야 아무도 안 쓰는
--   형제 세션이 만료일까지 살아남지 않는다.
--
-- 두 컬럼 모두 nullable 로 둔다. 배포와 마이그레이션 사이에 구버전 코드가
-- chain_id 없이 insert 해도 실패하지 않아야 하고, 서버는 chain_id 가 비면
-- 그 행의 id 를 체인 뿌리로 간주한다.

alter table public.auth_refresh_sessions
  add column if not exists rotated_at timestamptz null;

alter table public.auth_refresh_sessions
  add column if not exists chain_id uuid null;

-- 기존 세션은 각자가 자기 체인의 뿌리다.
update public.auth_refresh_sessions
  set chain_id = id
  where chain_id is null;

create index if not exists auth_refresh_sessions_chain_idx
  on public.auth_refresh_sessions (chain_id);
