import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";

/**
 * @openapi
 * /api/users/{userId}/collections:
 *   get:
 *     tags: [Users]
 *     summary: 특정 유저의 컬렉션 목록 조회
 *     description: |
 *       특정 유저의 컬렉션 목록을 반환합니다.
 *       - 소유자 본인: 공개/비공개 모두 반환
 *       - 타인: 공개 컬렉션만 반환
 *     parameters:
 *       - in: path
 *         name: userId
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
 *         description: 컬렉션 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [collections]
 *               properties:
 *                 collections:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/UserCollection"
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     collections:
 *                       - category_id: 1
 *                         id: 123
 *                         title: 내 컬렉션
 *                         image_id: "b7c6f3b0-6a0f-4b4a-9a90-2c02e4a2b9a1"
 *                         user_id: 45
 *                         user_name: gimgahui
 *                         selection_num: 12
 *                         is_public: true
 *               empty:
 *                 summary: 컬렉션 없음
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     collections: []
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
 *                   msg: Failed to fetch collections
 *                   data: {}
 */
// GET /api/users/:userId/collections — getUsersCollections
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId: userIdParam } = await params;
  const userId = parseInt(userIdParam, 10);

  if (isNaN(userId)) {
    return apiError("Invalid user ID", 400);
  }

  // If user is soft-deleted, behave as not found.
  const { data: userRow, error: userError } = await getSupabase()
    .from("userinfo")
    .select("user_id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (userError) {
    console.error("getUsersCollections user lookup error:", userError);
    return apiError("Failed to fetch collections", 500);
  }
  if (!userRow) {
    return apiError("User not found", 404);
  }

  const auth = await getAuthContext(request);
  const isOwner = auth?.userId === userId;

  let query = getSupabase()
    .from("collections")
    .select(
      "category_id, id, title, image_id, user_id, user_name, selection_num, is_public"
    )
    .eq("user_id", userId);

  if (!isOwner) {
    query = query.eq("is_public", true);
  }

  const { data, error } = await query;

  if (error) {
    console.error("getUsersCollections error:", error);
    return apiError("Failed to fetch collections", 500);
  }

  return apiResponse({ collections: data });
}
