import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { optionalAuth } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";
import { parsePagination } from "@/lib/pagination";
import { getUserImageMap } from "@/lib/userInfo";

/**
 * @openapi
 * /collections/ranking:
 *   get:
 *     tags: [Collections]
 *     summary: Get ranking collections
 *     description: |
 *       `is_public: true` 이면서 `image_id`가 있는 전체 컬렉션을 Fisher-Yates 셔플한 뒤
 *       `page`/`size` 로 잘라서 반환합니다. (호출마다 결과가 달라집니다)
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
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     collections:
 *                       - collection_id: 123
 *                         collection_title: My collection
 *                         image_id: "b7c6f3b0-6a0f-4b4a-9a90-2c02e4a2b9a1"
 *                         selection_num: 5
 *                         user_id: 45
 *                         user_name: gimgahui
 *                         user_image_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                         has_liked: false
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
 *         description: Failed to fetch ranking collections
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to fetch ranking collections
 *                   data: {}
 */
// GET /collections/ranking — getRankingCollections
// 최근 500개 후보 풀을 Fisher-Yates 셔플 후 최대 10개
export async function GET(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (auth instanceof NextResponse) return auth;
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
    .select("id, title, image_id, selection_num, user_id, user_name")
    .eq("is_public", true)
    .not("image_id", "is", null);

  if (categoryId !== null) {
    dbQuery = dbQuery.eq("category_id", categoryId);
  }
  if (auth) {
    dbQuery = dbQuery.neq("user_id", auth.userId);
  }
  if (blockedIds.length > 0) {
    dbQuery = dbQuery.not("user_id", "in", `(${blockedIds.join(",")})`);
  }

  // 최신 500개를 후보 풀로 제한 (전체 셔플 대신 풀 안에서 셔플)
  dbQuery = dbQuery.order("created_at", { ascending: false }).limit(500);

  const { data, error } = await dbQuery;

  if (error) {
    console.error("getRankingCollections error:", error);
    return apiError("Failed to fetch ranking collections", 500);
  }

  type CollectionRow = {
    id: number;
    title: string;
    image_id: string;
    selection_num: number;
    user_id: number;
    user_name: string | null;
  };

  const rows = [...((data ?? []) as unknown as CollectionRow[])];

  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }

  const pageRows = rows.slice(offset, offset + size);
  const userIds = [...new Set(pageRows.map((r) => r.user_id))];
  const collectionIds = pageRows.map((r) => r.id);

  // 작성자 프로필 이미지 / 로그인 유저의 좋아요 여부 병렬 조회
  const [userImageMap, { data: likeRows }] = await Promise.all([
    getUserImageMap(userIds),
    auth && collectionIds.length > 0
      ? getSupabase()
          .from("likes")
          .select("collection_id")
          .eq("user_id", auth.userId)
          .in("collection_id", collectionIds)
      : Promise.resolve({ data: null }),
  ]);

  const likedSet = new Set<number>();
  for (const l of likeRows ?? []) {
    likedSet.add(l.collection_id as number);
  }

  const collections = pageRows.map((col) => ({
    collection_id: col.id,
    collection_title: col.title,
    image_id: col.image_id,
    selection_num: col.selection_num ?? 0,
    user_id: col.user_id,
    user_name: col.user_name,
    user_image_id: userImageMap.get(col.user_id) ?? null,
    has_liked: auth ? likedSet.has(col.id) : false,
  }));

  return apiResponse({ collections });
}
