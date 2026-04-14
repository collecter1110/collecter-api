import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { requireAuth } from "@/lib/auth";
import { revokeRefreshSessionByToken } from "@/lib/authStore";
import { verifyJwt, type RefreshTokenClaims } from "@/lib/jwt";

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: 로그아웃
 *     description: 현재 세션의 refresh_token을 폐기합니다.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refresh_token]
 *             properties:
 *               refresh_token:
 *                 type: string
 *           examples:
 *             ok:
 *               value:
 *                 refresh_token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXAiOiJyZWZyZXNoIiwic2lkIjoic2Vzc2lvbi11dWlkIiwidXNlcl9pZCI6NDUsImVtYWlsIjoidXNlckBleGFtcGxlLmNvbSJ9.signature
 *     responses:
 *       200:
 *         description: 로그아웃 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success]
 *               properties:
 *                 success:
 *                   type: boolean
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     success: true
 *       400:
 *         description: refresh_token 누락 또는 유효하지 않음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: refresh_token is required
 *                   data: {}
 *       401:
 *         description: 인증 실패
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
 *                   msg: Failed to logout
 *                   data: {}
 */
// POST /auth/logout
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  // Client should send refresh token to revoke current session
  const body = await request.json().catch(() => ({}));
  const refresh_token = body?.refresh_token as string | undefined;
  if (!refresh_token) {
    return apiError("refresh_token is required", 400);
  }

  try {
    const claims = await verifyJwt<RefreshTokenClaims>(refresh_token);
    if (!claims || claims.typ !== "refresh") {
      return apiError("Invalid refresh token", 400);
    }
    if (claims.user_id !== auth.userId) {
      return apiError("Refresh token does not belong to this user", 403);
    }
    await revokeRefreshSessionByToken(refresh_token);
  } catch (e) {
    console.error("logout error:", e);
    return apiError("Failed to logout", 500);
  }

  return apiResponse({ success: true });
}
