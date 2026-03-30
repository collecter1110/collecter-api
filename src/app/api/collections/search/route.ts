import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// GET /api/collections/search?q=...&type=keyword|tag
// searchCollectionsByKeyword, searchCollectionsByTag
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  const type = request.nextUrl.searchParams.get("type") ?? "keyword";

  if (!q || q.trim() === "") {
    return NextResponse.json(
      { error: "Query parameter 'q' is required" },
      { status: 400 }
    );
  }

  const rpcName =
    type === "tag"
      ? "search_collections_by_tag"
      : "search_collections_by_keyword";

  const { data, error } = await getSupabase().rpc(rpcName, {
    query: q.trim(),
  });

  if (error) {
    console.error(`${rpcName} error:`, error);
    return NextResponse.json(
      { error: "Failed to search collections" },
      { status: 500 }
    );
  }

  return NextResponse.json({ collections: data ?? [] });
}
