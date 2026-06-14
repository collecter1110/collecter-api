import { getSupabase } from "@/lib/supabase";

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
