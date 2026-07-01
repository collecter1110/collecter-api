import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { mapCollectionListRowToApi } from "@/lib/collectionResponse";
import { getUserImageMap } from "@/lib/userInfo";

/**
 * @openapi
 * /users/me/collections:
 *   get:
 *     tags: [Users]
 *     summary: 내 컬렉션 목록 조회
 *     description: 로그인한 유저의 모든 컬렉션(공개/비공개 포함)을 반환합니다.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 내 컬렉션 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [collections]
 *               properties:
 *                 collections:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/MyCollection"
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     collections:
 *                       - category_id: 1
 *                         collection_id: 123
 *                         collection_title: 내 컬렉션
 *                         image_id: "b7c6f3b0-6a0f-4b4a-9a90-2c02e4a2b9a1"
 *                         user_id: 45
 *                         user_name: gimgahui
 *                         user_image_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                         selection_num: 12
 *                         is_public: true
 *                         created_at: "2026-04-06T12:34:56.000Z"
 *               empty:
 *                 summary: 컬렉션 없음
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     collections: []
 *       401:
 *         description: 인증 필요
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Unauthorized
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
// GET /users/me/collections — initializeMyCollections
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await getSupabase()
    .from("collections")
    .select(
      "category_id, id, title, image_id, user_id, user_name, selection_num, is_public, created_at"
    )
    .eq("user_id", auth.userId);

  if (error) {
    console.error("initializeMyCollections error:", error);
    return apiError("Failed to fetch collections", 500);
  }

  // 본인 프로필 이미지 조회 (모든 컬렉션의 작성자 = auth.userId)
  const userImageMap = await getUserImageMap([auth.userId]);
  const userImageId = userImageMap.get(auth.userId) ?? null;

  return apiResponse({
    collections: (data ?? []).map((row) => ({
      ...mapCollectionListRowToApi(
        row as { id: number; title: string | null } & Record<string, unknown>
      ),
      user_image_id: userImageId,
    })),
  });
}
