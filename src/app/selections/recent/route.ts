import { NextRequest } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";
import { getSelectionHomeMap } from "@/lib/selectionVisibility";
import { parsePagination } from "@/lib/pagination";

/**
 * @openapi
 * /selections/recent:
 *   get:
 *     tags: [Selections]
 *     summary: Get recent selections by category
 *     description: |
 *       셀렉션을 최신순(id 내림차순)으로 정렬하고, 셀렉션이 속한 home 컬렉션이
 *       `is_public: true` 인 것만 골라 `page`/`size` 페이지네이션하여 반환합니다.
 *
 *       - `category_id` 쿼리 파라미터를 주면 해당 카테고리로 필터링하고, 생략하면 전체에서 반환합니다.
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: false
 *         schema:
 *           type: string
 *         description: Bearer access token (optional)
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
 *         description: Recent selections
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
 *       500:
 *         description: Failed to fetch recent selections
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to fetch recent selections
 *                   data: {}
 */
// GET /selections/recent — getRecentSelections
// 최신순(id desc) + 카테고리 필터 + 가시성 필터 후 page/size 페이지네이션
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  const blockedIds = auth ? await getBlockedUserIds(auth.userId) : [];

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

  // 최신 CANDIDATE_POOL 개를 후보로 제한한다. 상한이 없으면 PostgREST 의 암묵적
  // 1000행 캡에 걸려, 이후 가시성 필터에서 최신 셀렉션이 조용히 누락될 수 있다.
  // 1000 은 요청당 최대 반환 행수와 동일한 상한이며, 그 이상은 이 조회 구조로는 불가하다.
  const CANDIDATE_POOL = 1000;

  let selectionQuery = getSupabase()
    .from("selections")
    .select(
      `id, title, keywords, owner_id,
       selection_images(image_id, sort_order)`
    )
    .order("id", { ascending: false })
    .limit(CANDIDATE_POOL);

  if (categoryId !== null) {
    selectionQuery = selectionQuery.eq("category_id", categoryId);
  }

  const { data, error } = await selectionQuery;

  if (error) {
    console.error("getRecentSelections error:", error);
    return apiError("Failed to fetch recent selections", 500);
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
    // 셀렉션이 속한 home 컬렉션이 공개(is_public=true)인 것만 노출
    rows = rows.filter((r) => homeMap.get(r.id)?.isPublic === true);
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
