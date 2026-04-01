import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";

// GET /api/users/ranking — getRankingUsers
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);

  let query = getSupabase()
    .from("userinfo")
    .select()
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(10);

  // 차단한 유저 제외
  if (auth) {
    const { data: blockedData } = await getSupabase()
      .from("block")
      .select("blocked_user_id")
      .eq("blocker_user_id", auth.userId);

    const blockedIds = (blockedData ?? []).map((b) => b.blocked_user_id);
    if (blockedIds.length > 0) {
      query = query.not("user_id", "in", `(${blockedIds.join(",")})`);
    }
  }

  const { data, error } = await query;

  if (error) {
    console.error("getRankingUsers error:", error);
    return NextResponse.json(
      { error: "Failed to fetch ranking users" },
      { status: 500 }
    );
  }

  return NextResponse.json({ users: data });
}
