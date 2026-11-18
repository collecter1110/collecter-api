/**
 * 죽은 refresh 세션 정리 스크립트
 *
 *   tsx scripts/cleanup-auth-sessions.ts                        # dry-run (기본)
 *   tsx scripts/cleanup-auth-sessions.ts --days=30              # 보존 기간 변경
 *   tsx scripts/cleanup-auth-sessions.ts --execute --confirm-delete
 *
 * --execute 하나만으로는 삭제되지 않는다. --confirm-delete 를 함께 줘야 한다.
 *
 * 삭제 대상은 "다시 유효해질 수 없는" 행뿐이다.
 *   - expires_at 이 지난 행        : 만료된 세션
 *   - revoked_at 이 찍힌 행        : 로그아웃으로 폐기된 세션
 *   - rotated_at 이 찍힌 행        : 갱신으로 대체된 세션. 유예(기본 60초)가
 *                                    지나면 영구히 쓸 수 없다
 *
 * 세 조건 모두 보존 기간(기본 7일)이 지난 것만 지운다. 바로 지우면 로그아웃·
 * 갱신 이력이 사라져 지금 같은 인증 문제를 추적할 수 없게 된다.
 *
 * 살아있는 세션(revoked_at·rotated_at 이 비어 있고 expires_at 이 남은 행)은
 * 어떤 조건에도 걸리지 않는다. 실행 전후로 그 수를 세어 확인한다.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// --- 환경변수 로드 (.env.local) ---
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}

const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");
const CONFIRMED = args.includes("--confirm-delete");
const daysArg = args.find((a) => a.startsWith("--days="));
const RETENTION_DAYS = daysArg ? Number(daysArg.split("=")[1]) : 7;

if (!Number.isFinite(RETENTION_DAYS) || RETENTION_DAYS < 0) {
  console.error(`잘못된 --days 값: ${daysArg}`);
  process.exit(1);
}

const TABLE = "auth_refresh_sessions";
// PostgREST 는 한 번에 최대 1000 행만 돌려준다. id 를 나눠 받아 반복 삭제한다.
const BATCH = 1000;

function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const supabase = getSupabase();
const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

/** 삭제 대상 조건. null 인 컬럼은 비교가 false 라 자동으로 제외된다. */
const DEAD_FILTER = `expires_at.lt.${cutoff},revoked_at.lt.${cutoff},rotated_at.lt.${cutoff}`;

async function countWhere(build: (q: any) => any): Promise<number> {
  const { count, error } = await build(
    supabase.from(TABLE).select("id", { count: "exact", head: true })
  );
  if (error) throw error;
  return count ?? 0;
}

async function countLive(): Promise<number> {
  return countWhere((q: any) =>
    q.is("revoked_at", null).is("rotated_at", null).gt("expires_at", new Date().toISOString())
  );
}

async function main() {
  const total = await countWhere((q: any) => q);
  const live = await countLive();
  const dead = await countWhere((q: any) => q.or(DEAD_FILTER));

  const expired = await countWhere((q: any) => q.lt("expires_at", cutoff));
  const revoked = await countWhere((q: any) => q.lt("revoked_at", cutoff));
  const rotated = await countWhere((q: any) => q.lt("rotated_at", cutoff));

  console.log(`대상 테이블: ${TABLE}`);
  console.log(`보존 기간: ${RETENTION_DAYS}일 (기준 시각 ${cutoff})`);
  console.log("");
  console.log(`전체 행:            ${total}`);
  console.log(`살아있는 세션:      ${live}  <- 건드리지 않는다`);
  console.log(`삭제 대상(중복 제거): ${dead}`);
  console.log(`  만료됨(expires_at): ${expired}`);
  console.log(`  폐기됨(revoked_at): ${revoked}`);
  console.log(`  대체됨(rotated_at): ${rotated}`);
  console.log("");

  if (dead === 0) {
    console.log("지울 것이 없다.");
    return;
  }

  if (!EXECUTE || !CONFIRMED) {
    console.log("dry-run. 실제로 지우려면:");
    console.log(`  tsx scripts/cleanup-auth-sessions.ts --days=${RETENTION_DAYS} --execute --confirm-delete`);
    return;
  }

  // 필터를 그대로 DELETE 에 건다. id 를 받아와 in() 으로 지우면 UUID 수천 개가
  // URL 에 실려 요청이 거부된다. PostgREST 의 1000행 제한은 응답 행 수에
  // 걸리는 것이지 DELETE 가 지우는 행 수를 제한하지 않는다.
  // 서버가 한 번에 다 못 지우는 경우에 대비해 남은 수가 0 이 될 때까지 반복한다.
  let deleted = 0;
  for (let pass = 1; ; pass++) {
    const { error: delError } = await supabase.from(TABLE).delete().or(DEAD_FILTER);
    if (delError) throw delError;

    const remaining = await countWhere((q: any) => q.or(DEAD_FILTER));
    console.log(`  ${pass}차 삭제 후 남은 대상: ${remaining}`);
    if (remaining === 0) break;
    if (pass >= 10) throw new Error(`10회 시도 후에도 ${remaining}행이 남았다`);
  }
  const totalMid = await countWhere((q: any) => q);
  deleted = total - totalMid;

  const totalAfter = await countWhere((q: any) => q);
  const liveAfter = await countLive();

  console.log("");
  console.log(`삭제 완료: ${deleted}행`);
  console.log(`전체 행:       ${total} -> ${totalAfter}`);
  console.log(`살아있는 세션: ${live} -> ${liveAfter}${live === liveAfter ? "  (변화 없음)" : "  ** 변했다. 확인 필요 **"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
