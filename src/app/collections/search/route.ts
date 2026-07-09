import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";
import { getUserImageMap } from "@/lib/userInfo";

/**
 * @openapi
 * /collections/search:
 *   get:
 *     tags: [Collections]
 *     summary: 컬렉션 검색
 *     description: |
 *       공개 컬렉션을 검색어로 검색합니다.
 *       검색어가 컬렉션 `title` 또는 `primary_keywords`(키워드명)에 부분 일치하면 모두 반환합니다.
 *       예) `사과` → `사과농장`, `사과케잌` 등도 포함됩니다.
 *
 *       Authorization 헤더가 있으면 차단한 유저의 컬렉션을 제외합니다. (본인 컬렉션은 포함)
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         example: 책
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
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     collections:
 *                       - collection_id: 123
 *                         collection_title: 사과농장
 *                         image_id: "b7c6f3b0-6a0f-4b4a-9a90-2c02e4a2b9a1"
 *                         user_id: 45
 *                         user_name: gimgahui
 *                         user_image_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                         primary_keywords: [{ keyword_id: 7, keyword_name: 사과, count: 3 }]
 *                         created_at: "2026-07-08"
 *                         category_id: 3
 *               empty:
 *                 summary: 검색 결과 없음
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     collections: []
 *       400:
 *         description: q 파라미터 누락
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: "Query parameter 'q' is required"
 *                   data: {}
 *       500:
 *         description: 검색 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to search collections
 *                   data: {}
 */
type CollectionRow = {
  id: number;
  title: string;
  image_id: string | null;
  user_id: number;
  user_name: string | null;
  primary_keywords: unknown;
  created_at: string;
  category_id: number;
};

function mapSearchCollection(
  row: CollectionRow,
  userImageMap: Map<number, string | null>
) {
  return {
    collection_id: row.id,
    collection_title: row.title,
    image_id: row.image_id ?? null,
    user_id: row.user_id,
    user_name: row.user_name,
    user_image_id: userImageMap.get(row.user_id) ?? null,
    primary_keywords: row.primary_keywords ?? [],
    created_at: row.created_at,
    category_id: row.category_id,
  };
}

// GET /collections/search?q=...
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");

  if (!q || q.trim() === "") {
    return apiError("Query parameter 'q' is required", 400);
  }

  const term = q.trim();
  const auth = await getAuthContext(request);

  // 차단 목록과 키워드 매칭 조회는 서로 독립적이므로 병렬 실행
  // keywordinfo에서 ILIKE로 keyword_id 목록 조회 (예: "사과" → 사과농장, 사과케잌)
  // primary_keywords 형식: [{"count": N, "keyword_id": N, "keyword_name": "..."}]
  const [blockedIds, { data: kwData }] = await Promise.all([
    auth ? getBlockedUserIds(auth.userId) : Promise.resolve([] as number[]),
    getSupabase()
      .from("keywordinfo")
      .select("keyword_id")
      .ilike("keyword_name", `%${term}%`),
  ]);

  let dbQuery = getSupabase()
    .from("collections")
    .select(
      "category_id, id, title, description, image_id, tags, user_id, user_name, primary_keywords, selection_num, like_num, is_public, created_at"
    )
    .eq("is_public", true);

  if (blockedIds.length > 0) {
    dbQuery = dbQuery.not("user_id", "in", `(${blockedIds.join(",")})`);
  }

  // title 부분 일치 OR primary_keywords에 매칭된 keyword_id 포함
  // - title.ilike.*사과*  → 콤마/괄호가 or() 파싱을 깨지 않도록 값을 큰따옴표로 감쌈
  // - primary_keywords.cs.[{"keyword_id": N}] → @> 부분 매칭
  const kwIds = (kwData ?? []).map((k) => k.keyword_id as number);
  const orConditions = [
    `title.ilike."*${term}*"`,
    ...kwIds.map((id) => `primary_keywords.cs.${JSON.stringify([{ keyword_id: id }])}`),
  ];
  dbQuery = dbQuery.or(orConditions.join(","));

  const { data, error } = await dbQuery;
  if (error) {
    console.error("searchCollections error:", error);
    return apiError("Failed to search collections", 500);
  }

  const rows = (data ?? []) as unknown as CollectionRow[];
  // 작성자 프로필 이미지(userinfo.image_id)를 한 번에 조회
  const userImageMap = await getUserImageMap(rows.map((r) => r.user_id));

  return apiResponse({
    collections: rows.map((row) => mapSearchCollection(row, userImageMap)),
  });
}
