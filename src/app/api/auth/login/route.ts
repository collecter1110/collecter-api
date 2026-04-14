import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { createRefreshSession, newSessionId } from "@/lib/authStore";
import { signAccessToken, signRefreshToken, verifyJwt, type VerifiedTokenClaims } from "@/lib/jwt";

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: 로그인 (기존 유저)
 *     description: OTP 검증 후 발급된 `verified_token`으로 `access_token`과 `refresh_token`을 반환합니다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [verified_token]
 *             properties:
 *               verified_token:
 *                 type: string
 *           examples:
 *             ok:
 *               value:
 *                 verified_token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXAiOiJ2ZXJpZmllZCIsInVzZXJfaWQiOjQ1LCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20ifQ.signature
 *     responses:
 *       200:
 *         description: 로그인 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [access_token, refresh_token]
 *               properties:
 *                 access_token:
 *                   type: string
 *                 refresh_token:
 *                   type: string
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     access_token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXAiOiJhY2Nlc3MiLCJ1c2VyX2lkIjo0NSwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIn0.signature
 *                     refresh_token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXAiOiJyZWZyZXNoIiwic2lkIjoic2Vzc2lvbi11dWlkIiwidXNlcl9pZCI6NDUsImVtYWlsIjoidXNlckBleGFtcGxlLmNvbSJ9.signature
 *       400:
 *         description: 잘못된 토큰
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Invalid or expired verified_token
 *                   data: {}
 */
// POST /api/auth/login
// body: { verified_token: string }
// OTP 인증 후 발급된 verified_token으로 access_token + refresh_token 반환 (기존 유저)
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const verified_token = body?.verified_token as string | undefined;

  if (!verified_token) {
    return apiError("verified_token is required", 400);
  }

  let claims: VerifiedTokenClaims;
  try {
    claims = await verifyJwt<VerifiedTokenClaims>(verified_token);
  } catch {
    return apiError("Invalid or expired verified_token", 400);
  }

  if (!claims || claims.typ !== "verified" || !claims.user_id || !claims.email) {
    return apiError("Invalid verified_token", 400);
  }

  const sessionId = newSessionId();
  const access_token = await signAccessToken({ typ: "access", user_id: claims.user_id, email: claims.email });
  const refresh_token = await signRefreshToken({ typ: "refresh", sid: sessionId, user_id: claims.user_id, email: claims.email });

  const refreshTtl = Number(process.env.AUTH_REFRESH_TOKEN_TTL_SECONDS ?? 60 * 60 * 24 * 30);
  await createRefreshSession({
    session_id: sessionId,
    user_id: claims.user_id,
    email: claims.email,
    refresh_token,
    expiresAt: new Date(Date.now() + refreshTtl * 1000),
  });

  return apiResponse({ access_token, refresh_token });
}
