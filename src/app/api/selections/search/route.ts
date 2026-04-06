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
 *                     - category_id: 1
 *                       collection_id: 123
 *                       selection_id: 456
 *                       user_id: 45
 *                       owner_id: 45
 *                       owner_name: gimgahui
 *                       title: 내 셀렉션
 *                       keywords:
 *                         - keyword_id: 7
 *                           keyword_name: 키워드
 *                       is_selectable: true
 *                       is_selecting: false
 *                       thumb_file_path: "https://cdn.example.com/selections/img1.jpg"
 *                       selection_images:
 *                         - image_id: "7c2c8fb0-4d1b-4bd1-9e2c-9a0c5d6d2d3a"
 *                           sort_order: 0
 *                           images:
 *                             - file_path: "https://cdn.example.com/selections/img1.jpg"
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
      "category_id, collection_id, selection_id, user_id, owner_id, owner_name, title, keywords, is_selectable, is_selecting, selection_images(image_id, sort_order, images(file_path))"
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

  const selections = (data ?? []).map((item) => {
    const imgs = (
      item.selection_images as { image_id: string; sort_order: number; images: { file_path: string }[] }[]
    ).sort((a, b) => a.sort_order - b.sort_order);
    return {
      ...item,
      thumb_file_path: imgs[0]?.images?.[0]?.file_path ?? null,
    };
  });

  return NextResponse.json({ selections });
}
