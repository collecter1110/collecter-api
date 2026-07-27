import { getSupabase } from "@/lib/supabase";

/**
 * collections.user_name / selections.owner_name에 쓸 사용자 이름을 조회한다.
 *
 * JWT claims의 name은 토큰 발급 시점 스냅샷이고 refresh에도 그대로 승계되므로
 * (refresh 토큰 TTL 30일) 개명 이후 최대 30일간 옛 이름이 남는다.
 * 두 컬럼에는 userinfo(user_id, name) 복합 FK가 걸려 있어 옛 이름으로 INSERT하면
 * 제약 위반이 나므로, 생성 직전에는 항상 userinfo를 읽는다.
 */
export async function getUserName(userId: number): Promise<string | null> {
  const { data } = await getSupabase()
    .from("userinfo")
    .select("name")
    .eq("user_id", userId)
    .single();

  return (data?.name as string | null) ?? null;
}

/**
 * 주어진 user_id 목록의 프로필 이미지(userinfo.image_id)를 한 번에 조회한다.
 * 반환: Map<user_id, image_id | null>
 */
export async function getUserImageMap(
  userIds: number[]
): Promise<Map<number, string | null>> {
  const map = new Map<number, string | null>();
  const uniqueIds = [...new Set(userIds)].filter((id) => id != null);
  if (uniqueIds.length === 0) return map;

  const { data } = await getSupabase()
    .from("userinfo")
    .select("user_id, image_id")
    .in("user_id", uniqueIds);

  for (const u of data ?? []) {
    map.set(u.user_id as number, (u.image_id as string | null) ?? null);
  }
  return map;
}
