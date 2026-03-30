import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

// GET /api/users/me/collections — initializeMyCollections
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await getSupabase()
    .from("collections")
    .select("")
    .eq("user_id", auth.userId);

  if (error) {
    console.error("initializeMyCollections error:", error);
    return NextResponse.json(
      { error: "Failed to fetch collections" },
      { status: 500 }
    );
  }

  return NextResponse.json({ collections: data });
}
