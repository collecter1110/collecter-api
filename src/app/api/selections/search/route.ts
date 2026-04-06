import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

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

  const selections = (data ?? []).map((item: Record<string, unknown>) => {
    const paths = item.image_file_paths as string[] | null;
    return {
      ...item,
      thumb_file_path: paths && paths.length > 0 ? paths[0] : null,
    };
  });

  return NextResponse.json({ selections });
}
