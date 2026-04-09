import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";

/**
 * @openapi
 * /api/selections/search:
 *   get:
 *     tags: [Selections]
 *     summary: 셀렉션 검색
 *     description: |
 *       키워드명으로 셀렉션을 검색합니다.
 *       Authorization 헤더가 있으면 본인 셀렉션과 차단한 유저의 셀렉션을 제외합니다.
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         example: 키워드
 *       - in: header
 *         name: Authorization
 *         required: false
 *         schema:
 *           type: string
 *         description: Bearer access token (optional)
 *         example: Bearer eyJhbGciOi...
 *     responses:
 *       200:
 *         description: 검색 결과 셀렉션 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [selections]
 *               properties:
 *                 selections:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/SearchSelection"
 *             examples:
 *               ok:
 *                 value:
 *                   selections:
 *                     - selection_id: 456
 *                       selection_title: 내 셀렉션
 *                       image_id: "7c2c8fb0-4d1b-4bd1-9e2c-9a0c5d6d2d3a"
 *                       collection_id: 123
 *                       collection_title: 내 컬렉션
 *               empty:
 *                 summary: 검색 결과 없음
 *                 value:
 *                   selections: []
 *       400:
 *         description: q 파라미터 누락
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: "Query parameter 'q' is required"
 *       500:
 *         description: 검색 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: Failed to search selections
 */
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
      "collection_id, selection_id, user_id, title, keywords, selection_images(image_id, sort_order), collections(title)"
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

  type SearchRow = {
    collection_id: number;
    selection_id: number;
    title: string;
    selection_images: { image_id: string; sort_order: number }[];
    collections: { title: string } | { title: string }[] | null;
  };

  const selections = (data ?? []).map((item) => {
    const row = item as SearchRow;
    const imgs = [...row.selection_images].sort((a, b) => a.sort_order - b.sort_order);
    const coll = row.collections;
    const collectionTitle = Array.isArray(coll) ? coll[0]?.title : coll?.title;

    return {
      selection_id: row.selection_id,
      selection_title: row.title,
      image_id: imgs[0]?.image_id ?? null,
      collection_id: row.collection_id,
      collection_title: collectionTitle ?? "",
    };
  });

  return NextResponse.json({ selections });
}
