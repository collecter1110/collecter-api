import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { revokeRefreshSessionByToken } from "@/lib/authStore";
import { verifyJwt, type RefreshTokenClaims } from "@/lib/jwt";

/**
 * @openapi
 * /api/auth/logout:
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
 *                   success: true
 *       400:
 *         description: refresh_token 누락 또는 유효하지 않음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: refresh_token is required
 *       401:
 *         description: 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: Unauthorized
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: Failed to logout
 */
// POST /api/auth/logout
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  // Client should send refresh token to revoke current session
  const body = await request.json().catch(() => ({}));
  const refresh_token = body?.refresh_token as string | undefined;
  if (!refresh_token) {
    return NextResponse.json(
      { error: "refresh_token is required" },
      { status: 400 }
    );
  }

  try {
    const claims = await verifyJwt<RefreshTokenClaims>(refresh_token);
    if (!claims || claims.typ !== "refresh") {
      return NextResponse.json({ error: "Invalid refresh token" }, { status: 400 });
    }
    await revokeRefreshSessionByToken(refresh_token);
  } catch (e) {
    console.error("logout error:", e);
    return NextResponse.json({ error: "Failed to logout" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
