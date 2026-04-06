import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";

/**
 * @openapi
 * /api/selections/ranking:
 *   get:
 *     tags: [Selections]
 *     summary: Get ranking selections
 *     description: |
 *       public 컬렉션(`collections.is_public = true`)에 속한 셀렉션을 `select_num` 내림차순으로 정렬 후,
 *       category_id별 상위 10개씩 반환합니다.
 *
 *       - Authorization 헤더가 있으면 차단한 유저의 셀렉션을 제외합니다. (토큰 선택)
 *       - `thumb_file_path`는 `selection_images` 중 `sort_order`가 가장 낮은 이미지의 `file_path`입니다.
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: false
 *         schema:
 *           type: string
 *         description: Bearer access token (optional)
 *         example: Bearer eyJhbGciOi...
 *     responses:
 *       200:
 *         description: Ranking selections
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [selections]
 *               properties:
 *                 selections:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/RankingSelection"
 *             examples:
 *               ok:
 *                 value:
 *                   selections:
 *                     - collection_id: 123
 *                       selection_id: 456
 *                       title: My selection
 *                       description: null
 *                       user_id: 45
 *                       owner_id: 45
 *                       owner_name: gimgahui
 *                       is_ordered: false
 *                       link: null
 *                       items: []
 *                       keywords:
 *                         - keyword_id: 7
 *                           keyword_name: "키워드"
 *                       created_at: "2026-04-06T12:34:56.000Z"
 *                       is_selectable: true
 *                       is_selecting: false
 *                       select_num: 99
 *                       category_id: 1
 *                       selection_images:
 *                         - image_id: "7c2c8fb0-4d1b-4bd1-9e2c-9a0c5d6d2d3a"
 *                           sort_order: 0
 *                           images:
 *                             - file_path: "https://cdn.example.com/selections/img1.jpg"
 *                       thumb_file_path: "https://cdn.example.com/selections/img1.jpg"
 *       500:
 *         description: Failed to fetch ranking selections
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: Failed to fetch ranking selections
 */
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
