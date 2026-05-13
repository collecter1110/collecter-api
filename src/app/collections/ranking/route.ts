import { NextRequest } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";

/**
 * @openapi
 * /collections/ranking:
 *   get:
 *     tags: [Collections]
 *     summary: Get ranking collections
 *     description: |
 *       `is_public: true` 이면서 `image_id`가 있는 컬렉션 중 최근 200개를 후보 풀로 삼아,
 *       Fisher-Yates 셔플 후 최대 10개를 반환합니다. (호출마다 결과가 달라집니다)
 *
 *       - Authorization 헤더가 있으면 본인과 차단한 유저의 컬렉션을 제외합니다. (토큰 선택)
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
 *         description: Ranking collections
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [collections]
 *               properties:
 *                 collections:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/RankingCollection"
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     collections:
 *                       - collection_id: 123
 *                         collection_title: My collection
 *                         image_id: "b7c6f3b0-6a0f-4b4a-9a90-2c02e4a2b9a1"
 *       500:
 *         description: Failed to fetch ranking collections
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to fetch ranking collections
 *                   data: {}
 */
// GET /collections/ranking — getRankingCollections
// 최근 200개 후보 풀을 Fisher-Yates 셔플 후 최대 10개
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  const blockedIds = auth ? await getBlockedUserIds(auth.userId) : [];

  let dbQuery = getSupabase()
    .from("collections")
    .select("id, title, image_id")
    .eq("is_public", true)
    .not("image_id", "is", null)
    .order("id", { ascending: false })
    .limit(200);

  if (auth) {
    dbQuery = dbQuery.neq("user_id", auth.userId);
  }
  if (blockedIds.length > 0) {
    dbQuery = dbQuery.not("user_id", "in", `(${blockedIds.join(",")})`);
  }

  const { data, error } = await dbQuery;

  if (error) {
    console.error("getRankingCollections error:", error);
    return apiError("Failed to fetch ranking collections", 500);
  }

  type CollectionRow = {
    id: number;
    title: string;
    image_id: string;
  };

  const rows = [...((data ?? []) as unknown as CollectionRow[])];

  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }

  const collections = rows.slice(0, 10).map((col) => ({
    collection_id: col.id,
    collection_title: col.title,
    image_id: col.image_id,
  }));

  return apiResponse({ collections });
}
