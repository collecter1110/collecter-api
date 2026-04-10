import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
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
 *       - `file_path`는 `selection_images` 중 `sort_order`가 0인 이미지의 `file_path`입니다.
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
 *                       - selection_id: 456
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
// GET /api/selections/ranking — getRankingSelections
// category_id별 select_num 상위 10개
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  const blockedIds = auth ? await getBlockedUserIds(auth.userId) : [];

  // public 컬렉션 소속 셀렉션만, select_num 내림차순
  let dbQuery = getSupabase()
    .from("selections")
    .select(
      "selection_id, title, keywords, user_id, select_num, category_id, " +
      "selection_images(image_id, sort_order), " +
      "collections!inner(is_public)"
    )
    .eq("collections.is_public", true)
    .order("select_num", { ascending: false });

  if (auth) {
    dbQuery = dbQuery.neq("user_id", auth.userId);
  }
  if (blockedIds.length > 0) {
    dbQuery = dbQuery.not("user_id", "in", `(${blockedIds.join(",")})`);
  }

  const { data, error } = await dbQuery;

  if (error) {
    console.error("getRankingSelections error:", error);
    return apiError("Failed to fetch ranking selections", 500);
  }

  type SelectionRow = {
    selection_id: number;
    title: string;
    keywords: unknown;
    user_id: number;
    select_num: number;
    category_id: number;
    selection_images: { image_id: string; sort_order: number }[];
  };

  // category_id별 상위 10개 추출
  const countPerCategory = new Map<number, number>();
  const selections = ((data ?? []) as unknown as SelectionRow[])
    .filter((item) => {
      const cat = item.category_id;
      const count = countPerCategory.get(cat) ?? 0;
      if (count >= 10) return false;
      countPerCategory.set(cat, count + 1);
      return true;
    })
    .map((item) => {
      const thumb = item.selection_images.find((si) => si.sort_order === 0);
      return {
        selection_id: item.selection_id,
        selection_title: item.title,
        image_id: thumb?.image_id ?? null,
        keywords: item.keywords,
      };
    });

  return apiResponse({ selections });
}
