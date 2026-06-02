import { NextRequest } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { findOrCreateUserByEmail } from "@/lib/authStore";
import { verifyGoogleIdToken } from "@/lib/google";
import { signVerifiedToken } from "@/lib/jwt";

/**
 * @openapi
 * /auth/oauth/google:
 *   post:
 *     tags: [Auth]
 *     summary: 구글 OAuth 로그인
 *     description: |
 *       네이티브 Google Sign-In SDK가 발급한 `id_token`을 검증하고 단기 `verified_token`을 반환합니다.
 *       OTP 검증(`/auth/otp/verify`)과 동일한 응답 형태로, 이후 흐름이 동일합니다.
 *       - 기존 유저: `/auth/login`에 `verified_token` 전달
 *       - 신규 유저: `/signup`에 `verified_token` 전달
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id_token]
 *             properties:
 *               id_token:
 *                 type: string
 *                 description: Google Sign-In SDK가 발급한 ID 토큰(JWT)
 *           examples:
 *             ok:
 *               value:
 *                 id_token: eyJhbGciOiJSUzI1NiIsImtpZCI6Ii4uLiJ9.eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20ifQ.signature
 *     responses:
 *       200:
 *         description: 구글 인증 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [verified_token, is_new_user, terms_agreed]
 *               properties:
 *                 verified_token:
 *                   type: string
 *                 is_new_user:
 *                   type: boolean
 *                 terms_agreed:
 *                   type: boolean
 *                   description: "약관 동의 여부. false이면 클라이언트가 약관 화면을 표시하고 /auth/login에 terms_agreed: true를 전달해야 합니다."
 *             examples:
 *               existing_user_agreed:
 *                 summary: 기존 유저 (약관 동의 완료)
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     verified_token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXAiOiJ2ZXJpZmllZCIsInVzZXJfaWQiOjQ1LCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20ifQ.signature
 *                     is_new_user: false
 *                     terms_agreed: true
 *               existing_user_not_agreed:
 *                 summary: 기존 유저 (약관 미동의)
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     verified_token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXAiOiJ2ZXJpZmllZCIsInVzZXJfaWQiOjQ1LCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20ifQ.signature
 *                     is_new_user: false
 *                     terms_agreed: false
 *               new_user:
 *                 summary: 신규 유저
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     verified_token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXAiOiJ2ZXJpZmllZCIsInVzZXJfaWQiOjQ2LCJlbWFpbCI6Im5ld3VzZXJAZXhhbXBsZS5jb20ifQ.signature
 *                     is_new_user: true
 *                     terms_agreed: false
 *       400:
 *         description: 파라미터 누락 또는 이메일 미인증
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               missing_token:
 *                 value:
 *                   errorCode: SU000
 *                   msg: id_token is required
 *                   data: {}
 *               email_not_verified:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Google email not verified
 *                   data: {}
 *       401:
 *         description: 유효하지 않은 구글 토큰
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               invalid_token:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Invalid Google id_token
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
 *                   msg: Server error
 *                   data: {}
 */
// POST /auth/oauth/google
// body: { id_token: string }
// 구글 ID 토큰 검증 후 단기 verified_token 반환 — 이후 /auth/login 또는 /signup 에서 실제 토큰 발급
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id_token = body?.id_token as string | undefined;

  if (!id_token) {
    return apiError("id_token is required", 400);
  }

  let profile;
  try {
    profile = await verifyGoogleIdToken(String(id_token));
  } catch (e) {
    console.error("google oauth verify error:", e);
    return apiError("Invalid Google id_token", 401);
  }

  if (!profile.email_verified) {
    return apiError("Google email not verified", 400);
  }

  try {
    const email = profile.email.toLowerCase();
    const { userId, isNew, terms_agreed } = await findOrCreateUserByEmail({ email });

    const verified_token = await signVerifiedToken({
      typ: "verified",
      user_id: userId,
      email,
    });

    return apiResponse({ verified_token, is_new_user: isNew, terms_agreed });
  } catch (e) {
    console.error("google oauth error:", e);
    return apiError("Server error", 500);
  }
}
