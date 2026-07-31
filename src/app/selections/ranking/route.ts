import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { optionalAuth } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";
import {
  getSelectionHomeMap,
  isSelectionVisibleToViewer,
} from "@/lib/selectionVisibility";
import { parsePagination } from "@/lib/pagination";

/**
 * @openapi
 * /selections/ranking:
 *   get:
 *     tags: [Selections]
 *     summary: Get ranking selections
 *     description: |
 *       이미지가 있는 전체 셀렉션에 가시성 필터를 적용한 뒤 Fisher-Yates 셔플하여
 *       `page`/`size` 로 잘라서 반환합니다. (호출마다 결과가 달라집니다)
 *
 *       - `category_id` 쿼리 파라미터를 주면 해당 카테고리로 필터링하고, 생략하면 전체에서 반환합니다.
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: false
 *         schema:
 *           type: string
 *         description: Bearer access token (optional)
 *           토큰이 만료·무효하면 401 을 반환한다. 헤더를 아예 보내지 않으면 비로그인으로 간주해 200 을 반환한다.
 *         example: Bearer eyJhbGciOi...
 *       - in: query
 *         name: category_id
 *         required: false
 *         schema:
 *           type: integer
 *         description: 카테고리 ID (categoryinfo 테이블). 생략하면 전체 카테고리에서 반환합니다.
 *         example: 3
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 페이지 번호 (1부터 시작). 기본값 1.
 *         example: 1
 *       - in: query
 *         name: size
 *         required: false
 *         schema:
 *           type: integer
 *           default: 10
 *         description: 페이지당 항목 수. 기본값 10.
 *         example: 10
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
 *                       - id: 456
 *                         collection_id: 123
 *                         selection_title: My selection
 *                         image_id: "7c2c8fb0-4d1b-4bd1-9e2c-9a0c5d6d2d3a"
 *                         keywords:
 *                           - keyword_id: 7
 *                             keyword_name: "키워드"
 *       401:
 *         description: >-
 *           Authorization 헤더를 보냈으나 토큰이 만료·변조되었거나 access 토큰이 아님.
 *           클라이언트는 토큰을 갱신한 뒤 재시도해야 한다.
 *           헤더를 보내지 않은 비로그인 요청은 401 이 아니라 200 이다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *             examples:
 *               error:
 *                 value:
 *                   error: Unauthorized
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
// GET /selections/ranking — getRankingSelections
// 최근 500개 후보 풀을 Fisher-Yates 셔플 후 최대 20개
export async function GET(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (auth instanceof NextResponse) return auth;
  // 차단 필터는 아래에서 JS 로 적용되므로 메인 조회와 병렬 실행
  const blockedIdsPromise = auth
    ? getBlockedUserIds(auth.userId)
    : Promise.resolve([] as number[]);

  const categoryParam = request.nextUrl.searchParams.get("category_id");
  const categoryId = categoryParam !== null ? parseInt(categoryParam, 10) : null;
  if (categoryParam !== null && (categoryId === null || isNaN(categoryId))) {
    return apiError("category_id must be a valid integer", 400);
  }

  const pagination = parsePagination(request.nextUrl.searchParams);
  if (!pagination.ok) {
    return apiError(pagination.error, 400);
  }
  const { offset, size } = pagination.value;

  let selectionQuery = getSupabase()
    .from("selections")
    .select(
      `id, title, keywords, owner_id,
       selection_images!inner(image_id, sort_order)`
    );

  if (categoryId !== null) {
    selectionQuery = selectionQuery.eq("category_id", categoryId);
  }

  // 최신 500개를 후보 풀로 제한 (전체 셔플/가시성 조회 대신 풀 안에서 처리)
  selectionQuery = selectionQuery
    .order("created_at", { ascending: false })
    .limit(500);

  const [{ data, error }, blockedIds] = await Promise.all([
    selectionQuery,
    blockedIdsPromise,
  ]);

  if (error) {
    console.error("getRankingSelections error:", error);
    return apiError("Failed to fetch ranking selections", 500);
  }

  type SelectionRow = {
    id: number;
    title: string;
    keywords: unknown;
    owner_id: number;
    selection_images: { image_id: string; sort_order: number }[];
  };

  let rows = (data ?? []) as unknown as SelectionRow[];

  if (auth) {
    rows = rows.filter((r) => r.owner_id !== auth.userId);
  }
  if (blockedIds.length > 0) {
    rows = rows.filter((r) => !blockedIds.includes(r.owner_id));
  }

  let homeMap = new Map<number, import("@/lib/selectionVisibility").SelectionHomeInfo>();
  if (rows.length > 0) {
    homeMap = await getSelectionHomeMap(rows.map((r) => r.id));
    rows = rows.filter((r) =>
      isSelectionVisibleToViewer(homeMap.get(r.id), auth?.userId ?? null)
    );
  }

  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }

  const selections = rows.slice(offset, offset + size).map((r) => {
    const thumb = [...r.selection_images].sort((a, b) => a.sort_order - b.sort_order)[0];
    return {
      id: r.id,
      collection_id: homeMap.get(r.id)?.homeCollectionId ?? null,
      selection_title: r.title,
      image_id: thumb?.image_id ?? null,
      keywords: r.keywords,
    };
  });

  return apiResponse({ selections });
}
