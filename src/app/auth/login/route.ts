import { NextRequest } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { createRefreshSession, newSessionId } from "@/lib/authStore";
import { signAccessToken, signRefreshToken, verifyJwt, type VerifiedTokenClaims } from "@/lib/jwt";

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: 로그인 (기존 유저)
 *     description: |
 *       OTP/OAuth 검증 후 발급된 `verified_token`으로 `access_token`과 `refresh_token`을 반환합니다.
 *       `terms_agreed: true`를 함께 전달하면 약관 동의를 DB에 저장합니다.
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
 *               terms_agreed:
 *                 type: boolean
 *                 description: 약관에 동의한 경우 true 전달 (미동의 상태였던 경우 DB에 저장됨)
 *           examples:
 *             with_terms:
 *               summary: 약관 동의와 함께 로그인
 *               value:
 *                 verified_token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXAiOiJ2ZXJpZmllZCIsInVzZXJfaWQiOjQ1LCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20ifQ.signature
 *                 terms_agreed: true
 *             without_terms:
 *               summary: 기존 약관 동의 유저 로그인
 *               value:
 *                 verified_token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXAiOiJ2ZXJpZmllZCIsInVzZXJfaWQiOjQ1LCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20ifQ.signature
 *     responses:
 *       200:
 *         description: 로그인 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [user_id, access_token, refresh_token]
 *               properties:
 *                 user_id:
 *                   type: integer
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
 *                     user_id: 45
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
// POST /auth/login
// body: { verified_token: string, terms_agreed?: boolean }
// OTP/OAuth 인증 후 발급된 verified_token으로 access_token + refresh_token 반환 (기존 유저)
// terms_agreed: true 전달 시 DB에 약관 동의 저장
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const verified_token = body?.verified_token as string | undefined;
  const terms_agreed = body?.terms_agreed as boolean | undefined;

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

  const { data: userRow } = await getSupabase()
    .from("userinfo")
    .select("name, terms_agreed")
    .eq("user_id", claims.user_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!userRow) {
    return apiError("User not found", 400);
  }

  if (terms_agreed === true && !userRow.terms_agreed) {
    await getSupabase()
      .from("userinfo")
      .update({ terms_agreed: true })
      .eq("user_id", claims.user_id);
  }

  const name = String(userRow.name ?? "");
  const sessionId = newSessionId();
  // 토큰 서명 병렬 실행
  const [access_token, refresh_token] = await Promise.all([
    signAccessToken({ typ: "access", user_id: claims.user_id, email: claims.email, name }),
    signRefreshToken({ typ: "refresh", sid: sessionId, user_id: claims.user_id, email: claims.email, name }),
  ]);

  const refreshTtl = Number(process.env.AUTH_REFRESH_TOKEN_TTL_SECONDS ?? 60 * 60 * 24 * 30);
  await createRefreshSession({
    session_id: sessionId,
    user_id: claims.user_id,
    email: claims.email,
    refresh_token,
    expiresAt: new Date(Date.now() + refreshTtl * 1000),
  });

  return apiResponse({ user_id: claims.user_id, access_token, refresh_token });
}
