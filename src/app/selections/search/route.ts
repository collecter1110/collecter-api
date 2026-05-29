import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";

/**
 * @openapi
 * /selections/search:
 *   get:
 *     tags: [Selections]
 *     summary: 셀렉션 검색
 *     description: |
 *       키워드명으로 셀렉션을 검색합니다.
 *       public 컬렉션에 매핑된 셀렉션만 검색됩니다.
 *       Authorization 헤더가 있으면 차단한 유저의 셀렉션을 제외합니다. (본인 셀렉션은 포함)
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
 *               required: [errorCode, msg, data]
 *               properties:
 *                 errorCode:
 *                   type: string
 *                   example: SU000
 *                 msg:
 *                   type: string
 *                   example: ok
 *                 data:
 *                   type: object
 *                   required: [selections]
 *                   properties:
 *                     selections:
 *                       type: array
 *                       items:
 *                         $ref: "#/components/schemas/SearchSelection"
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     selections:
 *                       - id: 456
 *                         selection_title: 내 셀렉션
 *                         image_id: "7c2c8fb0-4d1b-4bd1-9e2c-9a0c5d6d2d3a"
 *                         collection_id: 123
 *                         collection_title: 내 컬렉션
 *               empty:
 *                 summary: 검색 결과 없음
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     selections: []
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
 *                   msg: Failed to search selections
 *                   data: {}
 */
// GET /selections/search?q=... — searchSelections
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");

  if (!q || q.trim() === "") {
    return apiError("Query parameter 'q' is required", 400);
  }

  const auth = await getAuthContext(request);
  const blockedIds = auth ? await getBlockedUserIds(auth.userId) : [];

  // keywords 형식: [{"keyword_id": N, "keyword_name": "..."}]
  const { data: kwData } = await getSupabase()
    .from("keywordinfo")
    .select("keyword_id")
    .ilike("keyword_name", `%${q.trim()}%`);

  const kwIds = (kwData ?? []).map((k) => k.keyword_id as number);
  if (kwIds.length === 0) {
    return apiResponse({ selections: [] });
  }

  // collection_selections → collections(is_public) + selections(keywords 매칭) 조인
  const { data, error } = await getSupabase()
    .from("collection_selections")
    .select(
      `collection_id,
       collections!inner(title, is_public),
       selections!inner(
         id, owner_id, title, keywords,
         selection_images(image_id, sort_order)
       )`
    )
    .eq("collections.is_public", true);

  if (error) {
    console.error("searchSelections error:", error);
    return apiError("Failed to search selections", 500);
  }

  type CSRow = {
    collection_id: number;
    collections: { title: string } | { title: string }[] | null;
    selections: {
      id: number;
      owner_id: number;
      title: string;
      keywords: { keyword_id: number; keyword_name: string }[] | null;
      selection_images: { image_id: string; sort_order: number }[];
    };
  };

  const rows = (data ?? []) as unknown as CSRow[];

  // 키워드 필터링 + 본인/차단 제외 + 중복 제거
  const seen = new Set<number>();
  const filtered: CSRow[] = [];

  for (const row of rows) {
    const s = row.selections;
    if (seen.has(s.id)) continue;

    // 키워드 매칭
    const hasMatch = s.keywords?.some((kw) => kwIds.includes(kw.keyword_id));
    if (!hasMatch) continue;

    if (blockedIds.includes(s.owner_id)) continue;

    seen.add(s.id);
    filtered.push(row);
  }

  // public 컬렉션에 매핑된 셀렉션이면 본인/타인 구분 없이 모두 반환한다.
  const selections = filtered.map((row) => {
    const s = row.selections;
    const coll = row.collections;
    const collectionTitle = Array.isArray(coll) ? coll[0]?.title : coll?.title;

    const cover = (s.selection_images ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)[0];

    return {
      id: s.id,
      selection_title: s.title,
      image_id: cover?.image_id ?? null,
      collection_id: row.collection_id,
      collection_title: collectionTitle ?? "",
    };
  });

  return apiResponse({ selections });
}
