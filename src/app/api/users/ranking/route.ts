import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";

/**
 * @openapi
 * /api/users/ranking:
 *   get:
 *     tags: [Users]
 *     summary: 랭킹 유저 목록
 *     description: |
 *       최신 가입순으로 최대 10명의 유저를 반환합니다.
 *       Authorization 헤더가 있으면 차단한 유저를 제외합니다.
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: false
 *         schema:
 *           type: string
 *         description: Bearer access token (optional)
 *         example: Bearer eyJhbGciOi...
 *     responses:
 *       200:
 *         description: 랭킹 유저 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [users]
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/RankingUser"
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     users:
 *                       - user_id: 45
 *                         name: gimgahui
 *                         email: user@example.com
 *                         description: 안녕하세요
 *                         image_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                         created_at: "2026-04-06T12:34:56.000Z"
 *                         deleted_at: null
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
 *                   msg: Failed to fetch ranking users
 *                   data: {}
 */
// GET /api/users/ranking — getRankingUsers
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);

  let query = getSupabase()
    .from("userinfo")
    .select("user_id, name, email, description, image_id, created_at, deleted_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(10);

  // 차단한 유저 제외
  if (auth) {
    const { data: blockedData } = await getSupabase()
      .from("block")
      .select("blocked_user_id")
      .eq("blocker_user_id", auth.userId);

    const blockedIds = (blockedData ?? []).map((b) => b.blocked_user_id);
    if (blockedIds.length > 0) {
      query = query.not("user_id", "in", `(${blockedIds.join(",")})`);
    }
  }

  const { data, error } = await query;

  if (error) {
    console.error("getRankingUsers error:", error);
    return apiError("Failed to fetch ranking users", 500);
  }

  return apiResponse({ users: data });
}
