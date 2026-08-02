import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import {
  createRefreshSession,
  getValidRefreshSession,
  newSessionId,
  rotateRefreshSessionById,
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
 *       기존 세션은 회전 처리되고 짧은 유예 시간 동안 중복 갱신 요청을 허용합니다.
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

  const session = await getValidRefreshSession({ session_id: claims.sid, refresh_token });
  if (!session) {
    return apiError("Unauthorized", 401);
  }

  if (!claims.name) {
    return apiError("Unauthorized", 401);
  }

  // Token rotation: 기존 session은 짧은 유예 시간 동안만 중복 refresh를 허용한다.
  const newSid = newSessionId();
  const name = claims.name;
  // 토큰 서명 병렬 실행
  const [new_access_token, new_refresh_token] = await Promise.all([
    signAccessToken({
      typ: "access",
      user_id: claims.user_id,
      email: claims.email,
      name,
    }),
    signRefreshToken({
      typ: "refresh",
      sid: newSid,
      user_id: claims.user_id,
      email: claims.email,
      name,
    }),
  ]);

  const refreshTtl = Number(process.env.AUTH_REFRESH_TOKEN_TTL_SECONDS ?? 60 * 60 * 24 * 30);
  await createRefreshSession({
    session_id: newSid,
    user_id: claims.user_id,
    email: claims.email,
    refresh_token: new_refresh_token,
    expiresAt: new Date(Date.now() + refreshTtl * 1000),
    // 로그아웃이 체인 단위로 폐기할 수 있도록 원본 체인을 이어받는다.
    chain_id: session.chain_id,
  });
  await rotateRefreshSessionById(claims.sid);

  return apiResponse({ access_token: new_access_token, refresh_token: new_refresh_token });
}
