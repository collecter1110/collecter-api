import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";

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

  return NextResponse.json({ collections: data });
}
