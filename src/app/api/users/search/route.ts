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

  return NextResponse.json({ users });
}
