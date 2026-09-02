import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { requireAuth } from "@/lib/auth";
import { revokeRefreshChainByToken } from "@/lib/authStore";
import { verifyJwt, type RefreshTokenClaims } from "@/lib/jwt";
import { getSupabase } from "@/lib/supabase";

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: 로그아웃
 *     description: |
 *       현재 세션의 refresh_token을 폐기합니다.
 *
 *       `fcm_token`을 함께 보내면 이 기기의 FCM 토큰도 같이 삭제합니다. 보내지 않으면
 *       토큰이 남아 로그아웃한 기기로 계속 알림이 갑니다. **이 기기의 토큰만** 지우므로
 *       같은 유저가 다른 기기에 로그인해 있어도 그쪽 알림은 유지됩니다.
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
 *               fcm_token:
 *                 type: string
 *                 description: 이 기기의 FCM 토큰. 있으면 함께 삭제합니다.
 *           examples:
 *             ok:
 *               value:
 *                 refresh_token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXAiOiJyZWZyZXNoIiwic2lkIjoic2Vzc2lvbi11dWlkIiwidXNlcl9pZCI6NDUsImVtYWlsIjoidXNlckBleGFtcGxlLmNvbSJ9.signature
 *                 fcm_token: "fZx1...token"
 *     responses:
 *       200:
 *         description: |
 *           로그아웃 성공. 이미 만료/변조된 refresh_token 을 보낸 경우에도 폐기할 세션이
 *           없을 뿐이므로 성공으로 응답합니다(멱등). 클라이언트는 이 응답을 받으면
 *           로컬 토큰을 지우면 됩니다.
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
 *         description: refresh_token 누락, 또는 refresh 가 아닌 종류의 토큰
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
  const fcm_token = body?.fcm_token as string | undefined;
  if (!refresh_token) {
    return apiError("refresh_token is required", 400);
  }

  // 만료되거나 변조된 refresh 토큰은 이미 아무것도 갱신할 수 없는 상태다. 여기서
  // 실패를 돌려주면 클라이언트가 로그아웃을 끝내지 못하고 죽은 토큰을 기기에 그대로
  // 남겨 무한 재시도에 빠진다. 폐기할 세션이 없을 뿐이므로 로그아웃은 성공으로 본다.
  let claims: RefreshTokenClaims | null = null;
  try {
    claims = await verifyJwt<RefreshTokenClaims>(refresh_token);
  } catch (e) {
    console.warn("logout: unverifiable refresh token, nothing to revoke:", e);
  }

  if (claims) {
    if (claims.typ !== "refresh") {
      return apiError("Invalid refresh token", 400);
    }
    if (claims.user_id !== auth.userId) {
      return apiError("Refresh token does not belong to this user", 403);
    }
    // 폐기 자체의 실패는 일시적 장애다. 세션이 살아 있을 수 있으니 500 으로 알린다.
    try {
      await revokeRefreshChainByToken(refresh_token);
    } catch (e) {
      console.error("logout revoke error:", e);
      return apiError("Failed to logout", 500);
    }
  }

  // Only this handset's token: the same user may stay logged in on another
  // device, and clearing every row would silently kill push there too. A
  // failure here must not fail the logout — the session is already revoked.
  if (fcm_token) {
    const { error } = await getSupabase()
      .from("fcm_tokens")
      .delete()
      .eq("fcm_token", fcm_token)
      .eq("user_id", auth.userId);

    if (error) {
      console.error("logout fcm token delete error:", error);
    }
  }

  return apiResponse({ success: true });
}
