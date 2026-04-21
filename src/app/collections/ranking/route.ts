import { NextRequest, NextResponse } from "next/server";
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
 *       `is_public: true` 이면서 `image_id`가 있는 컬렉션을 가져옵니다.
 *       category_id별로 무작위 셔플(Fisher-Yates) 후 최대 10개씩 반환합니다.
 *
 *       - Authorization 헤더가 있으면 차단한 유저의 컬렉션을 제외합니다. (토큰 선택)
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
// public + 이미지 있는 컬렉션을 좋아요순 → 최신순으로 최대 10개
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  const blockedIds = auth ? await getBlockedUserIds(auth.userId) : [];

  let dbQuery = getSupabase()
    .from("collections")
    .select("id, title, image_id, created_at, likes(count)")
    .eq("is_public", true)
    .not("image_id", "is", null)
    .order("created_at", { ascending: false });

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
    created_at: string;
    likes: { count: number }[];
  };

  const rows = (data ?? []) as unknown as CollectionRow[];

  const collections = rows
    .map((col) => ({
      collection_id: col.id,
      collection_title: col.title,
      image_id: col.image_id,
      like_count: col.likes[0]?.count ?? 0,
      created_at: col.created_at,
    }))
    .sort((a, b) => {
      if (b.like_count !== a.like_count) return b.like_count - a.like_count;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
    .slice(0, 10)
    .map(({ collection_id, collection_title, image_id }) => ({
      collection_id,
      collection_title,
      image_id,
    }));

  return apiResponse({ collections });
}
