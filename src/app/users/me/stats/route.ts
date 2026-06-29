import { NextRequest, NextResponse } from "next/server";
import { apiResponse } from "@/lib/apiResponse";
import { requireAuth } from "@/lib/auth";
import { getUserTasteStats } from "@/lib/tasteStats";

/**
 * @openapi
 * /users/me/stats:
 *   get:
 *     tags: [Users]
 *     summary: 내 취향 통계 조회
 *     description: |
 *       로그인한 유저의 취향 통계를 반환합니다.
 *       - `collection_count`: 내가 만든 컬렉션 수
 *       - `like_count`: 내가 좋아요한 수
 *       - `selecting_count`: 셀렉팅 수
 *       - `selected_count`: 셀렉티드 수
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 취향 통계
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [collection_count, like_count, selecting_count, selected_count]
 *               properties:
 *                 collection_count:
 *                   type: integer
 *                 like_count:
 *                   type: integer
 *                 selecting_count:
 *                   type: integer
 *                 selected_count:
 *                   type: integer
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     collection_count: 12
 *                     like_count: 34
 *                     selecting_count: 5
 *                     selected_count: 87
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
 */
// GET /users/me/stats — getUserTasteStats
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const stats = await getUserTasteStats(auth.userId);
  return apiResponse({ ...stats });
}
