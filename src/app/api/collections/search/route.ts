import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";

/**
 * @openapi
 * /api/collections/search:
 *   get:
 *     tags: [Collections]
 *     summary: 컬렉션 검색
 *     description: |
 *       키워드 또는 태그로 공개 컬렉션을 검색합니다.
 *       - `type=keyword` (기본값): `primary_keywords`에서 키워드명으로 검색
 *       - `type=tag`: `tags` 배열에서 정확히 일치하는 태그로 검색
 *
 *       Authorization 헤더가 있으면 본인 컬렉션과 차단한 유저의 컬렉션을 제외합니다.
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         example: 책
 *       - in: query
 *         name: type
 *         required: false
 *         schema:
 *           type: string
 *           enum: [keyword, tag]
 *           default: keyword
 *         example: keyword
 *       - in: header
 *         name: Authorization
 *         required: false
 *         schema:
 *           type: string
 *         description: Bearer access token (optional)
 *         example: Bearer eyJhbGciOi...
 *     responses:
 *       200:
 *         description: 검색 결과 컬렉션 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [collections]
 *               properties:
 *                 collections:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/SearchCollection"
 *             examples:
 *               ok:
 *                 value:
 *                   collections:
 *                     - collection_id: 123
 *                       collection_title: 내 컬렉션
 *                       file_path: "https://cdn.example.com/collections/cover.jpg"
 *               empty:
 *                 summary: 검색 결과 없음
 *                 value:
 *                   collections: []
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
 *                   error: Failed to search collections
 */
function mapSearchCollection(row: {
  id: number;
  title: string;
  image_file_path: string | null;
}) {
  return {
    collection_id: row.id,
    collection_title: row.title,
    file_path: row.image_file_path ?? null,
  };
}

// GET /api/collections/search?q=...&type=keyword|tag
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  const type = request.nextUrl.searchParams.get("type") ?? "keyword";

  if (!q || q.trim() === "") {
    return NextResponse.json(
      { error: "Query parameter 'q' is required" },
      { status: 400 }
    );
  }

  const auth = await getAuthContext(request);
  const blockedIds = auth ? await getBlockedUserIds(auth.userId) : [];

  let dbQuery = getSupabase()
    .from("collections")
    .select(
      "category_id, id, title, description, image_file_path, image_id, tags, user_id, user_name, primary_keywords, selection_num, like_num, is_public"
    )
    .eq("is_public", true);

  if (auth) {
    dbQuery = dbQuery.neq("user_id", auth.userId);
  }
  if (blockedIds.length > 0) {
    dbQuery = dbQuery.not("user_id", "in", `(${blockedIds.join(",")})`);
  }

  if (type === "tag") {
    // tags가 jsonb 배열인 경우가 많아서 JSON 문자열로 명시 (PostgREST cs)
    // 예: tags @> '["책"]'::jsonb
    dbQuery = dbQuery.filter("tags", "cs", JSON.stringify([q.trim()]));

    const { data, error } = await dbQuery;
    if (error) {
      console.error("searchCollectionsByTag error:", error);
      return NextResponse.json({ error: "Failed to search collections" }, { status: 500 });
    }
    return NextResponse.json({
      collections: (data ?? []).map((row) =>
        mapSearchCollection(row as { id: number; title: string; image_file_path: string | null })
      ),
    });
  }

  // keyword 검색: keywordinfo에서 ILIKE로 keyword_id 목록 조회
  // primary_keywords 형식: [{"count": N, "keyword_id": N, "keyword_name": "..."}]
  // @> 연산자로 {"keyword_id": N} 부분 매칭 가능
  const { data: kwData } = await getSupabase()
    .from("keywordinfo")
    .select("keyword_id")
    .ilike("keyword_name", `%${q.trim()}%`);

  const kwIds = (kwData ?? []).map((k) => k.keyword_id as number);
  if (kwIds.length === 0) {
    return NextResponse.json({ collections: [] });
  }

  // 각 keyword_id에 대해 primary_keywords @> '[{"keyword_id": N}]' OR 조건
  dbQuery = dbQuery.or(
    kwIds.map((id) => `primary_keywords.cs.${JSON.stringify([{ keyword_id: id }])}`).join(",")
  );

  const { data, error } = await dbQuery;
  if (error) {
    console.error("searchCollectionsByKeyword error:", error);
    return NextResponse.json({ error: "Failed to search collections" }, { status: 500 });
  }

  return NextResponse.json({
    collections: (data ?? []).map((row) =>
      mapSearchCollection(row as { id: number; title: string; image_file_path: string | null })
    ),
  });
}
