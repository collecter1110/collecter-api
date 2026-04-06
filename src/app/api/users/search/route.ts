import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";

// GET /api/users/search?q=... — searchUsers
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");

  if (!q || q.trim() === "") {
    return NextResponse.json(
      { error: "Query parameter 'q' is required" },
      { status: 400 }
    );
  }

  const auth = await getAuthContext(request);
  const blockedIds = auth ? await getBlockedUserIds(auth.userId) : [];

  let query = getSupabase()
    .from("userinfo")
    .select("user_id, name, description, image_file_path, image_id")
    .textSearch("name", q.trim(), { type: "plain", config: "simple" })
    .is("deleted_at", null);

  if (auth) {
    query = query.neq("user_id", auth.userId);
  }
  if (blockedIds.length > 0) {
    query = query.not("user_id", "in", `(${blockedIds.join(",")})`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("searchUsers error:", error);
    return NextResponse.json({ error: "Failed to search users" }, { status: 500 });
  }

  return NextResponse.json({ users: data ?? [] });
}
