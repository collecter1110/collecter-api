import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { UserInfo } from "@/types/user";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query || query.trim() === "") {
    return NextResponse.json(
      { error: "Query parameter 'q' is required" },
      { status: 400 }
    );
  }

  const { data, error } = await getSupabase().rpc("search_users", {
    query: query.trim(),
  });

  if (error) {
    console.error("search_users rpc error:", error);
    return NextResponse.json(
      { error: "Failed to search users" },
      { status: 500 }
    );
  }

  const users: UserInfo[] = data ?? [];

  // Filter out soft-deleted users (userinfo.deleted_at IS NOT NULL).
  if (users.length > 0) {
    const ids = users.map((u) => u.user_id).filter((id) => Number.isFinite(id));
    if (ids.length > 0) {
      const { data: activeIds, error: activeError } = await getSupabase()
        .from("userinfo")
        .select("user_id")
        .in("user_id", ids as number[])
        .is("deleted_at", null);

      if (activeError) {
        console.error("search_users soft-delete filter error:", activeError);
        return NextResponse.json({ error: "Failed to search users" }, { status: 500 });
      }

      const activeSet = new Set((activeIds ?? []).map((r) => r.user_id));
      return NextResponse.json({ users: users.filter((u) => activeSet.has(u.user_id)) });
    }
  }

  return NextResponse.json({ users });
}
