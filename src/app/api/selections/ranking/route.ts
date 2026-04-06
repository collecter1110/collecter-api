import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";

// GET /api/selections/ranking — getRankingSelections
// category_id별 select_num 상위 10개
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  const blockedIds = auth ? await getBlockedUserIds(auth.userId) : [];

  // public 컬렉션 소속 셀렉션만, select_num 내림차순
  let dbQuery = getSupabase()
    .from("selections")
    .select(
      "collection_id, selection_id, title, description, user_id, owner_id, owner_name, " +
      "is_ordered, link, items, keywords, created_at, is_selectable, is_selecting, " +
      "select_num, category_id, " +
      "selection_images(image_id, sort_order, images(file_path)), " +
      "collections!inner(is_public)"
    )
    .eq("collections.is_public", true)
    .order("select_num", { ascending: false });

  if (blockedIds.length > 0) {
    dbQuery = dbQuery.not("user_id", "in", `(${blockedIds.join(",")})`);
  }

  const { data, error } = await dbQuery;

  if (error) {
    console.error("getRankingSelections error:", error);
    return NextResponse.json({ error: "Failed to fetch ranking selections" }, { status: 500 });
  }

  // category_id별 상위 10개 추출
  const countPerCategory = new Map<number, number>();
  const selections = (data ?? [])
    .filter((item) => {
      const cat = item.category_id as number;
      const count = countPerCategory.get(cat) ?? 0;
      if (count >= 10) return false;
      countPerCategory.set(cat, count + 1);
      return true;
    })
    .map((item) => {
      const imgs = (
        item.selection_images as { image_id: string; sort_order: number; images: { file_path: string }[] }[]
      ).sort((a, b) => a.sort_order - b.sort_order);
      const { collections: _c, ...rest } = item as typeof item & { collections: unknown };
      return {
        ...rest,
        thumb_file_path: imgs[0]?.images?.[0]?.file_path ?? null,
      };
    });

  return NextResponse.json({ selections });
}
