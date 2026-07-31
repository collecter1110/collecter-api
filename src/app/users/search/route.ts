import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { optionalAuth } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";

/**
 * @openapi
 * /users/search:
 *   get:
 *     tags: [Users]
 *     summary: 유저 검색
 *     description: |
 *       유저네임으로 유저를 검색합니다. Full-text search를 사용합니다.
 *       Authorization 헤더가 있으면 본인 계정과 차단한 유저를 제외합니다.
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         example: gimgahui
 *       - in: header
 *         name: Authorization
 *         required: false
 *         schema:
 *           type: string
 *         description: Bearer access token (optional)
 *           토큰이 만료·무효하면 401 을 반환한다. 헤더를 아예 보내지 않으면 비로그인으로 간주해 200 을 반환한다.
 *         example: Bearer eyJhbGciOi...
 *     responses:
 *       200:
 *         description: 검색된 유저 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [users]
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/SearchUser"
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     users:
 *                       - user_id: 45
 *                         user_name: gimgahui
 *                         description: 안녕하세요
 *                         image_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *               empty:
 *                 summary: 검색 결과 없음
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     users: []
 *       400:
 *         description: q 파라미터 누락
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: "Query parameter 'q' is required"
 *                   data: {}
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
 *         description: 검색 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to search users
 *                   data: {}
 */
// GET /users/search?q=... — searchUsers
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");

  if (!q || q.trim() === "") {
    return apiError("Query parameter 'q' is required", 400);
  }

  const auth = await optionalAuth(request);
  if (auth instanceof NextResponse) return auth;
  const blockedIds = auth ? await getBlockedUserIds(auth.userId) : [];

  let query = getSupabase()
    .from("userinfo")
    .select("user_id, name, description, image_id")
    .textSearch("name", q.trim(), { type: "plain", config: "simple" })
    .is("deleted_at", null);

  if (auth) {
    query = query.neq("user_id", auth.userId);
  }
  if (blockedIds.length > 0) {
    query = query.not("user_id", "in", `(${blockedIds.join(",")})`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("searchUsers error:", error);
    return apiError("Failed to search users", 500);
  }

  const users = (data ?? []).map((u) => ({
    user_id: u.user_id as number,
    user_name: u.name as string,
    description: (u.description as string | null) ?? null,
    image_id: (u.image_id as string | null) ?? null,
  }));

  return apiResponse({ users });
}
