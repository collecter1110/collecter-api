import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// GET /api/users/:userId/collections — getUsersCollections
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId: userIdParam } = await params;
  const userId = parseInt(userIdParam, 10);

  if (isNaN(userId)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  const { data, error } = await getSupabase()
    .from("collections")
    .select(
      "category_id, id, title, image_file_path, user_id, user_name, primary_keywords, selection_num, is_public"
    )
    .eq("user_id", userId);

  if (error) {
    console.error("getUsersCollections error:", error);
    return NextResponse.json(
      { error: "Failed to fetch collections" },
      { status: 500 }
    );
  }

  return NextResponse.json({ collections: data });
}
