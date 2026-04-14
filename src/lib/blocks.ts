import { getSupabase } from "./supabase";

/**
 * 양방향 차단 user_id 목록을 반환합니다.
 * - 내가 차단한 유저 (blocker = me)
 * - 나를 차단한 유저 (blocked = me)
 */
export async function getBlockedUserIds(userId: number): Promise<number[]> {
  const [{ data: blocked }, { data: blockedBy }] = await Promise.all([
    getSupabase()
      .from("block")
      .select("blocked_user_id")
      .eq("blocker_user_id", userId),
    getSupabase()
      .from("block")
      .select("blocker_user_id")
      .eq("blocked_user_id", userId),
  ]);

  const ids = new Set<number>();
  for (const b of blocked ?? []) ids.add(b.blocked_user_id);
  for (const b of blockedBy ?? []) ids.add(b.blocker_user_id);
  return [...ids];
}

