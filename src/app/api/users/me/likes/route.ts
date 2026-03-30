import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

// GET /api/users/me/likes — getLikeCollections
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await getSupabase()
    .from("likes")
    .select("collections(*)")
    .eq("user_id", auth.userId);

  if (error) {
    console.error("getLikeCollections error:", error);
    return NextResponse.json(
      { error: "Failed to fetch liked collections" },
      { status: 500 }
    );
  }

  const collections = (data ?? [])
    .filter((item) => item.collections !== null)
    .map((item) => item.collections);

  return NextResponse.json({ collections });
}
