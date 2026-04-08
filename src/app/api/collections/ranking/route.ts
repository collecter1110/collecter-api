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
 *                   collections:
 *                     - collection_id: 123
 *                       collection_title: My collection
 *                       file_path: "https://cdn.example.com/collections/cover.jpg"
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
    .select("id, title, category_id, user_id, image_id, images(file_path)")
    .eq("is_public", true);

  if (blockedIds.length > 0) {
    dbQuery = dbQuery.not("user_id", "in", `(${blockedIds.join(",")})`);
  }

  const { data, error } = await dbQuery;

  if (error) {
    console.error("getRankingCollections error:", error);
    return NextResponse.json({ error: "Failed to fetch ranking collections" }, { status: 500 });
  }

  type CollectionRow = {
    id: number;
    title: string;
    category_id: number;
    user_id: number;
    image_id: string | null;
    images: { file_path: string }[] | null;
  };
  const rows = (data ?? []) as unknown as CollectionRow[];

  // category_id별로 그룹핑 후 무작위 셔플, 최대 10개 선택
  const grouped = new Map<number, CollectionRow[]>();
  for (const col of rows) {
    const cat = col.category_id;
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(col);
  }

  const collections = [];
  for (const group of grouped.values()) {
    // Fisher-Yates shuffle
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
    for (const col of group.slice(0, 10)) {
      collections.push({
        collection_id: col.id,
        collection_title: col.title,
        file_path: Array.isArray(col.images) && col.images.length > 0 ? col.images[0].file_path : null,
      });
    }
  }

  return NextResponse.json({ collections });
}
