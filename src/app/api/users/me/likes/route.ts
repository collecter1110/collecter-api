import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";

/**
 * @openapi
 * /api/users/me/likes:
 *   get:
 *     tags: [Users]
 *     summary: 내가 좋아요한 컬렉션 목록
 *     description: 차단한 유저의 컬렉션은 제외됩니다.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 좋아요한 컬렉션 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [collections]
 *               properties:
 *                 collections:
 *                   type: array
 *                   items:
 *                     type: object
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     collections:
 *                       - id: 123
 *                         category_id: 1
 *                         title: 좋아요한 컬렉션
 *                         description: 컬렉션 설명
 *                         image_id: "b7c6f3b0-6a0f-4b4a-9a90-2c02e4a2b9a1"
 *                         tags: ["태그1"]
 *                         user_id: 99
 *                         user_name: otheruser
 *                         primary_keywords:
 *                           - keyword_id: 3
 *                             keyword_name: 여행
 *                             count: 2
 *                         selection_num: 8
 *                         like_num: 21
 *                         is_public: true
 *               empty:
 *                 summary: 좋아요한 컬렉션 없음
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
 *                   msg: Failed to fetch liked collections
 *                   data: {}
 */
// GET /api/users/me/likes — getLikeCollections
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await getSupabase()
    .from("likes")
    .select("collections(id, category_id, title, description, image_id, tags, user_id, user_name, primary_keywords, selection_num, like_num, is_public)")
    .eq("user_id", auth.userId);

  if (error) {
    console.error("getLikeCollections error:", error);
    return apiError("Failed to fetch liked collections", 500);
  }

  const blockedIds = await getBlockedUserIds(auth.userId);

  const collections = (data ?? [])
    .filter((item) => item.collections !== null)
    .map((item) => item.collections)
    .filter((c) =>
      blockedIds.length === 0 || !blockedIds.includes((c as { user_id: number }).user_id)
    );

  return apiResponse({ collections });
}
