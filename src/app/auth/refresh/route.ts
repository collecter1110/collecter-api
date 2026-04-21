import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import {
  createRefreshSession,
  isRefreshSessionValid,
  newSessionId,
  revokeRefreshSessionById,
} from "@/lib/authStore";
import {
  signAccessToken,
  signRefreshToken,
  verifyJwt,
  type RefreshTokenClaims,
} from "@/lib/jwt";

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: 토큰 갱신
 *     description: |
 *       `refresh_token`을 사용해 새 `access_token`과 `refresh_token`을 발급합니다.
 *       기존 세션은 폐기되고 새 세션이 생성됩니다 (Token Rotation).
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
 *         description: 토큰 갱신 성공
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
 *                     access_token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXAiOiJhY2Nlc3MiLCJ1c2VyX2lkIjo0NSwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIn0.newSignature
 *                     refresh_token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXAiOiJyZWZyZXNoIiwic2lkIjoibmV3LXNlc3Npb24tdXVpZCIsInVzZXJfaWQiOjQ1LCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20ifQ.newSignature
 *       400:
 *         description: 잘못된 refresh_token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Invalid refresh token
 *                   data: {}
 *       401:
 *         description: 세션이 만료되었거나 폐기됨
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
// POST /auth/refresh
// body: { refresh_token: string }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const refresh_token = body?.refresh_token as string | undefined;

  if (!refresh_token) {
    return apiError("refresh_token is required", 400);
  }

  let claims: RefreshTokenClaims;
  try {
    claims = await verifyJwt<RefreshTokenClaims>(refresh_token);
  } catch {
    return apiError("Invalid refresh token", 400);
  }

  if (!claims || claims.typ !== "refresh" || !claims.sid || !claims.user_id || !claims.email) {
    return apiError("Invalid refresh token", 400);
  }

  const ok = await isRefreshSessionValid({ session_id: claims.sid, refresh_token });
  if (!ok) {
    return apiError("Unauthorized", 401);
  }

  // Token rotation: 기존 session 폐기 후 새 session 발급
  const newSid = newSessionId();
  const name = claims.name ?? "";
  const new_access_token = await signAccessToken({
    typ: "access",
    user_id: claims.user_id,
    email: claims.email,
    name,
  });
  const new_refresh_token = await signRefreshToken({
    typ: "refresh",
    sid: newSid,
    user_id: claims.user_id,
    email: claims.email,
    name,
  });

  const refreshTtl = Number(process.env.AUTH_REFRESH_TOKEN_TTL_SECONDS ?? 60 * 60 * 24 * 30);
  await createRefreshSession({
    session_id: newSid,
    user_id: claims.user_id,
    email: claims.email,
    refresh_token: new_refresh_token,
    expiresAt: new Date(Date.now() + refreshTtl * 1000),
  });
  await revokeRefreshSessionById(claims.sid);

  return apiResponse({ access_token: new_access_token, refresh_token: new_refresh_token });
}
