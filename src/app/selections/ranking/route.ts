import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";

/**
 * @openapi
 * /selections/ranking:
 *   get:
 *     tags: [Selections]
 *     summary: Get ranking selections
 *     description: |
 *       public 컬렉션에 매핑된 셀렉션을 `select_num` 내림차순으로 정렬 후,
 *       category_id별 상위 3개씩 반환합니다.
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
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     selections:
 *                       - id: 456
 *                         collection_id: 123
 *                         selection_title: My selection
 *                         image_id: "7c2c8fb0-4d1b-4bd1-9e2c-9a0c5d6d2d3a"
 *                         keywords:
 *                           - keyword_id: 7
 *                             keyword_name: "키워드"
 *       500:
 *         description: Failed to fetch ranking selections
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to fetch ranking selections
 *                   data: {}
 */
// GET /selections/ranking — getRankingSelections
// category_id별 select_num 상위 3개
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  const blockedIds = auth ? await getBlockedUserIds(auth.userId) : [];

  // collection_selections → collections(is_public) 조인으로 public 컬렉션 소속 셀렉션만 조회
  const { data, error } = await getSupabase()
    .from("collection_selections")
    .select(
      `collection_id,
       collections!inner(is_public),
       selections_v2!inner(
         id, title, keywords, user_id, select_num, category_id,
         selection_images(image_id, sort_order)
       )`
    )
    .eq("collections.is_public", true);

  if (error) {
    console.error("getRankingSelections error:", error);
    return apiError("Failed to fetch ranking selections", 500);
  }

  type CSRow = {
    collection_id: number;
    selections_v2: {
      id: number;
      title: string;
      keywords: unknown;
      user_id: number;
      select_num: number;
      category_id: number;
      selection_images: { image_id: string; sort_order: number }[];
    };
  };

  const rows = (data ?? []) as unknown as CSRow[];

  // 셀렉션 중복 제거 (여러 public 컬렉션에 속할 수 있음)
  const selectionMap = new Map<number, CSRow>();
  for (const row of rows) {
    if (!selectionMap.has(row.selections_v2.id)) {
      selectionMap.set(row.selections_v2.id, row);
    }
  }

  let uniqueRows = Array.from(selectionMap.values());

  // 본인 셀렉션 제외, 차단 유저 제외
  if (auth) {
    uniqueRows = uniqueRows.filter((r) => r.selections_v2.user_id !== auth.userId);
  }
  if (blockedIds.length > 0) {
    uniqueRows = uniqueRows.filter((r) => !blockedIds.includes(r.selections_v2.user_id));
  }

  // select_num 내림차순 정렬
  uniqueRows.sort((a, b) => b.selections_v2.select_num - a.selections_v2.select_num);

  // category_id별 상위 3개 추출
  const countPerCategory = new Map<number, number>();
  const selections = uniqueRows
    .filter((row) => {
      const cat = row.selections_v2.category_id;
      const count = countPerCategory.get(cat) ?? 0;
      if (count >= 3) return false;
      countPerCategory.set(cat, count + 1);
      return true;
    })
    .map((row) => {
      const s = row.selections_v2;
      const thumb = s.selection_images.find((si) => si.sort_order === 0);
      return {
        id: s.id,
        collection_id: row.collection_id,
        selection_title: s.title,
        image_id: thumb?.image_id ?? null,
        keywords: s.keywords,
      };
    });

  return apiResponse({ selections });
}
