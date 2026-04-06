import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";

// GET /api/collections/ranking — getRankingCollections
// category_id별 무작위 최대 10개 (public, 이미지 있는 것만)
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  const blockedIds = auth ? await getBlockedUserIds(auth.userId) : [];

  let dbQuery = getSupabase()
    .from("collections")
    .select(
      "id, user_id, title, description, created_at, image_file_path, image_id, " +
      "tags, user_name, primary_keywords, selection_num, like_num, is_public, category_id"
    )
    .eq("is_public", true)
    .not("image_file_path", "is", null);

  if (blockedIds.length > 0) {
    dbQuery = dbQuery.not("user_id", "in", `(${blockedIds.join(",")})`);
  }

  const { data, error } = await dbQuery;

  if (error) {
    console.error("getRankingCollections error:", error);
    return NextResponse.json({ error: "Failed to fetch ranking collections" }, { status: 500 });
  }

  type CollectionRow = { category_id: number; [key: string]: unknown };
  const rows = (data ?? []) as unknown as CollectionRow[];

  // category_id별로 그룹핑 후 무작위 셔플, 최대 10개 선택
  const grouped = new Map<number, CollectionRow[]>();
  for (const col of rows) {
    const cat = col.category_id;
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(col);
  }

  const collections: CollectionRow[] = [];
  for (const group of grouped.values()) {
    // Fisher-Yates shuffle
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
    collections.push(...group.slice(0, 10));
  }

  return NextResponse.json({ collections });
}
