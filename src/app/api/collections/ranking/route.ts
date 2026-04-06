import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";

/**
 * @openapi
 * /api/collections/ranking:
 *   get:
 *     tags: [Collections]
 *     summary: Get ranking collections
 *     description: |
 *       `is_public: true` 이면서 `image_file_path`가 있는 컬렉션을 가져옵니다.
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
 *                   collections:
 *                     - id: 123
 *                       user_id: 45
 *                       title: My collection
 *                       description: null
 *                       created_at: "2026-04-06T12:34:56.000Z"
 *                       image_file_path: "https://cdn.example.com/collections/cover.jpg"
 *                       image_id: "b7c6f3b0-6a0f-4b4a-9a90-2c02e4a2b9a1"
 *                       tags: ["tag1", "tag2"]
 *                       user_name: gimgahui
 *                       primary_keywords:
 *                         - keyword_id: 7
 *                           keyword_name: "키워드"
 *                       selection_num: 12
 *                       like_num: 34
 *                       is_public: true
 *                       category_id: 1
 *       500:
 *         description: Failed to fetch ranking collections
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: Failed to fetch ranking collections
 */
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
