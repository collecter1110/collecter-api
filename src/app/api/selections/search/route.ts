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

  const auth = await getAuthContext(request);
  const blockedIds = auth ? await getBlockedUserIds(auth.userId) : [];

  // keywords 형식: [{"keyword_id": N, "keyword_name": "..."}]
  // keywordinfo에서 ILIKE로 keyword_id 목록 조회 후 @> 부분 매칭
  const { data: kwData } = await getSupabase()
    .from("keywordinfo")
    .select("keyword_id")
    .ilike("keyword_name", `%${q.trim()}%`);

  const kwIds = (kwData ?? []).map((k) => k.keyword_id as number);
  if (kwIds.length === 0) {
    return NextResponse.json({ selections: [] });
  }

  let dbQuery = getSupabase()
    .from("selections")
    .select(
      "category_id, collection_id, selection_id, user_id, owner_id, owner_name, title, keywords, is_selectable, is_selecting, selection_images(image_id, sort_order, images(file_path))"
    )
    .or(
      kwIds.map((id) => `keywords.cs.${JSON.stringify([{ keyword_id: id }])}`).join(",")
    );

  if (auth) {
    dbQuery = dbQuery.neq("user_id", auth.userId);
  }
  if (blockedIds.length > 0) {
    dbQuery = dbQuery.not("user_id", "in", `(${blockedIds.join(",")})`);
  }

  const { data, error } = await dbQuery;

  if (error) {
    console.error("searchSelections error:", error);
    return NextResponse.json({ error: "Failed to search selections" }, { status: 500 });
  }

  const selections = (data ?? []).map((item) => {
    const imgs = (
      item.selection_images as { image_id: string; sort_order: number; images: { file_path: string }[] }[]
    ).sort((a, b) => a.sort_order - b.sort_order);
    return {
      ...item,
      thumb_file_path: imgs[0]?.images?.[0]?.file_path ?? null,
    };
  });

  return NextResponse.json({ selections });
}
