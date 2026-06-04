import { NextRequest } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";
import { parsePagination } from "@/lib/pagination";

/**
 * @openapi
 * /collections/recent:
 *   get:
 *     tags: [Collections]
 *     summary: Get recent collections by category
 *     description: |
 *       `is_public: true` 인 컬렉션을 최신순(id 내림차순)으로
 *       `page`/`size` 페이지네이션하여 반환합니다.
 *
 *       - Authorization 헤더가 있으면 본인과 차단한 유저의 컬렉션을 제외합니다. (토큰 선택)
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
 *         description: Recent collections
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
 *                         selection_num: 5
 *       500:
 *         description: Failed to fetch recent collections
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to fetch recent collections
 *                   data: {}
 */
// GET /collections/recent — getRecentCollections
// 최신순(id desc) + 카테고리 필터 + page/size DB 페이지네이션
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

  let dbQuery = getSupabase()
    .from("collections")
    .select("id, title, image_id, selection_num")
    .eq("is_public", true)
    .order("id", { ascending: false })
    .range(offset, offset + size - 1);

  if (categoryId !== null) {
    dbQuery = dbQuery.eq("category_id", categoryId);
  }
  if (auth) {
    dbQuery = dbQuery.neq("user_id", auth.userId);
  }
  if (blockedIds.length > 0) {
    dbQuery = dbQuery.not("user_id", "in", `(${blockedIds.join(",")})`);
  }

  const { data, error } = await dbQuery;

  if (error) {
    console.error("getRecentCollections error:", error);
    return apiError("Failed to fetch recent collections", 500);
  }

  type CollectionRow = {
    id: number;
    title: string;
    image_id: string | null;
    selection_num: number;
  };

  const rows = (data ?? []) as unknown as CollectionRow[];

  const collections = rows.map((col) => ({
    collection_id: col.id,
    collection_title: col.title,
    image_id: col.image_id ?? null,
    selection_num: col.selection_num ?? 0,
  }));

  return apiResponse({ collections });
}
