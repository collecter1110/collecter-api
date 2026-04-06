import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";

// GET /api/selections/search?q=... — searchSelections
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");

  if (!q || q.trim() === "") {
    return NextResponse.json(
      { error: "Query parameter 'q' is required" },
      { status: 400 }
    );
  }

  const { data, error } = await getSupabase().rpc(
    "search_selections_by_keyword",
    { query: q.trim() }
  );

  if (error) {
    console.error("searchSelections error:", error);
    return NextResponse.json(
      { error: "Failed to search selections" },
      { status: 500 }
    );
  }

  const auth = await getAuthContext(request);
  const blockedIds = auth ? await getBlockedUserIds(auth.userId) : [];

  const selections = (data ?? [])
    .filter((item: Record<string, unknown>) =>
      blockedIds.length === 0 || !blockedIds.includes(item.user_id as number)
    )
    .map((item: Record<string, unknown>) => {
      const paths = item.image_file_paths as string[] | null;
      return {
        ...item,
        thumb_file_path: paths && paths.length > 0 ? paths[0] : null,
      };
    });

  return NextResponse.json({ selections });
}
