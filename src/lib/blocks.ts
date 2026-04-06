import { getSupabase } from "./supabase";

/**
 * 로그인한 유저가 차단한 user_id 목록을 반환합니다.
 */
export async function getBlockedUserIds(userId: number): Promise<number[]> {
  const { data } = await getSupabase()
    .from("block")
    .select("blocked_user_id")
    .eq("blocker_user_id", userId);
  return (data ?? []).map((b) => b.blocked_user_id);
}

