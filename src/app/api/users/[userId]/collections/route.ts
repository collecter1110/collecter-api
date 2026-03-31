import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";

// GET /api/users/:userId/collections — getUsersCollections
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId: userIdParam } = await params;
  const userId = parseInt(userIdParam, 10);

  if (isNaN(userId)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  const auth = await getAuthContext(request);
  const isOwner = auth?.userId === userId;

  let query = getSupabase()
    .from("collections")
    .select(
      "category_id, id, title, image_file_path, user_id, user_name, primary_keywords, selection_num, is_public"
    )
    .eq("user_id", userId);

  if (!isOwner) {
    query = query.eq("is_public", true);
  }

  const { data, error } = await query;

  if (error) {
    console.error("getUsersCollections error:", error);
    return NextResponse.json(
      { error: "Failed to fetch collections" },
      { status: 500 }
    );
  }

  return NextResponse.json({ collections: data });
}
