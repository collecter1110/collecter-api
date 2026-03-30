import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

// GET /api/users/me/blocks — initializeBlockedIds
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await getSupabase()
    .from("block")
    .select("blocked_user_id")
    .eq("blocker_user_id", auth.userId);

  if (error) {
    console.error("initializeBlockedIds error:", error);
    return NextResponse.json(
      { error: "Failed to fetch blocked users" },
      { status: 500 }
    );
  }

  const blockedUserIds = (data ?? []).map((item) => item.blocked_user_id);

  return NextResponse.json({ blocked_user_ids: blockedUserIds });
}

// POST /api/users/me/blocks — block(blockedUserId)
// body: { blocked_user_id: number }
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { blocked_user_id } = body;

  if (!blocked_user_id) {
    return NextResponse.json(
      { error: "blocked_user_id is required" },
      { status: 400 }
    );
  }

  const { error } = await getSupabase().from("block").insert({
    blocker_user_id: auth.userId,
    blocked_user_id,
  });

  if (error) {
    console.error("block error:", error);
    return NextResponse.json({ error: "Failed to block user" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
