import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";

// GET /api/collections/ranking — getRankingCollections
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  const userId = auth?.userId ?? 0;

  const { data, error } = await getSupabase().rpc("get_ranking_collections", {
    input_user_id: userId,
  });

  if (error) {
    console.error("getRankingCollections error:", error);
    return NextResponse.json(
      { error: "Failed to fetch ranking collections" },
      { status: 500 }
    );
  }

  const blockedIds = auth ? await getBlockedUserIds(auth.userId) : [];
  const collections = blockedIds.length > 0
    ? (data ?? []).filter((c: { user_id: number }) => !blockedIds.includes(c.user_id))
    : (data ?? []);

  return NextResponse.json({ collections });
}
