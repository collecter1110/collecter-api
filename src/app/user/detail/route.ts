import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";

/**
 * @openapi
 * /user/detail:
 *   get:
 *     tags: [Users]
 *     summary: 유저 상세 조회 (프로필 + 컬렉션 요약)
 *     description: |
 *       `user_id`로 유저의 프로필 정보를 조회하고, 해당 유저의 컬렉션 목록을 함께 반환합니다.
 *       - Authorization 헤더가 있고 본인(`auth.userId === user_id`)이면 공개/비공개 컬렉션 모두 반환
 *       - 그 외에는 공개 컬렉션만 반환
 *     parameters:
 *       - in: query
 *         name: user_id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 45
 *       - in: header
 *         name: Authorization
 *         required: false
 *         schema:
 *           type: string
 *         description: Bearer access token (optional)
 *         example: Bearer eyJhbGciOi...
 *     responses:
 *       200:
 *         description: 유저 상세
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/UserDetailResponse"
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     user_id: 45
 *                     user_name: gimgahui
 *                     image_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     description: 안녕하세요
 *                     collections:
 *                       - collection_id: 123
 *                         collection_title: 내 컬렉션
 *                         image_id: "b7c6f3b0-6a0f-4b4a-9a90-2c02e4a2b9a1"
 *                         selection_num: 12
 *       400:
 *         description: user_id 누락/오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Invalid user ID
 *                   data: {}
 *       404:
 *         description: 유저를 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: User not found
 *                   data: {}
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to fetch user detail
 *                   data: {}
 */
export async function GET(request: NextRequest) {
  const userIdParam = request.nextUrl.searchParams.get("user_id");
  const userId = userIdParam ? parseInt(userIdParam, 10) : NaN;

  if (isNaN(userId)) {
    return apiError("Invalid user ID", 400);
  }

  const { data: userRow, error: userError } = await getSupabase()
    .from("userinfo")
    .select("user_id, name, description, image_id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (userError) {
    console.error("getUserDetail user lookup error:", userError);
    return apiError("Failed to fetch user detail", 500);
  }

  if (!userRow) {
    return apiError("User not found", 404);
  }

  const auth = await getAuthContext(request);
  const isOwner = auth?.userId === userId;

  let colQuery = getSupabase()
    .from("collections")
    .select("id, title, image_id, selection_num, is_public")
    .eq("user_id", userId);

  if (!isOwner) {
    colQuery = colQuery.eq("is_public", true);
  }

  // 차단 목록과 컬렉션 목록 조회를 병렬 실행 (검사 순서는 기존과 동일)
  const [blockedIds, { data: collectionsRows, error: collectionsError }] =
    await Promise.all([
      auth && !isOwner ? getBlockedUserIds(auth.userId) : Promise.resolve([]),
      colQuery,
    ]);

  if (auth && !isOwner) {
    if (blockedIds.includes(userId)) {
      return apiError("User not found", 404);
    }
  }

  if (collectionsError) {
    console.error("getUserDetail collections error:", collectionsError);
    return apiError("Failed to fetch user detail", 500);
  }

  const collections = (collectionsRows ?? []).map((c) => ({
    collection_id: c.id as number,
    collection_title: c.title as string,
    image_id: (c.image_id as string | null) ?? null,
    selection_num: (c.selection_num as number | null) ?? 0,
  }));

  return apiResponse({
    user_id: userRow.user_id as number,
    user_name: userRow.name as string,
    image_id: (userRow.image_id as string | null) ?? null,
    description: (userRow.description as string | null) ?? null,
    collections,
  });
}

