import { NextRequest } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { findOrCreateUserByAppleId } from "@/lib/authStore";
import { verifyAppleIdToken } from "@/lib/apple";
import { signVerifiedToken } from "@/lib/jwt";

/**
 * @openapi
 * /auth/oauth/apple:
 *   post:
 *     tags: [Auth]
 *     summary: Apple OAuth 로그인
 *     description: |
 *       Apple Sign In SDK가 발급한 `identity_token`을 검증하고 단기 `verified_token`을 반환합니다.
 *       OTP 검증(`/auth/otp/verify`), Google OAuth와 동일한 응답 형태로, 이후 흐름이 동일합니다.
 *       이후 `/auth/login`에 `verified_token`을 전달합니다.
 *
 *       **주의**: Apple은 첫 로그인 시에만 사용자 이메일을 제공합니다.
 *       JWT 클레임에 email이 없으면 body의 `email`을 사용하며, 신규 유저인데 email이 없으면 400을 반환합니다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identity_token]
 *             properties:
 *               identity_token:
 *                 type: string
 *                 description: Apple Sign In SDK가 발급한 ID 토큰(JWT). 이메일은 JWT 클레임에서 직접 추출합니다.
 *           examples:
 *             ok:
 *               value:
 *                 identity_token: eyJhbGciOiJSUzI1NiIsImtpZCI6Ii4uLiJ9...
 *     responses:
 *       200:
 *         description: Apple 인증 성공
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
 *                     verified_token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                     is_new_user: false
 *                     terms_agreed: true
 *               existing_user_not_agreed:
 *                 summary: 기존 유저 (약관 미동의)
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     verified_token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                     is_new_user: false
 *                     terms_agreed: false
 *               new_user:
 *                 summary: 신규 유저
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     verified_token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                     is_new_user: true
 *                     terms_agreed: false
 *       400:
 *         description: 파라미터 누락 또는 신규 유저인데 email 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               missing_token:
 *                 value:
 *                   errorCode: SU000
 *                   msg: identity_token is required
 *                   data: {}
 *               missing_email:
 *                 value:
 *                   errorCode: SU000
 *                   msg: email is required for first-time Apple Sign In
 *                   data: {}
 *       401:
 *         description: 유효하지 않은 Apple 토큰
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               invalid_token:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Invalid Apple identity_token
 *                   data: {}
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 */
// POST /auth/oauth/apple
// body: { identity_token: string }
// Apple ID 토큰 검증 후 단기 verified_token 반환 — 이후 /auth/login 에서 실제 토큰 발급
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const identity_token = body?.identity_token as string | undefined;

  if (!identity_token) {
    return apiError("identity_token is required", 400);
  }

  let profile;
  try {
    profile = await verifyAppleIdToken(String(identity_token));
  } catch (e) {
    console.error("apple oauth verify error:", e);
    return apiError("Invalid Apple identity_token", 401);
  }

  try {
    const { userId, isNew, email, terms_agreed } = await findOrCreateUserByAppleId({
      appleUserId: profile.sub,
      email: profile.email,
    });

    const verified_token = await signVerifiedToken({
      typ: "verified",
      user_id: userId,
      email,
    });

    return apiResponse({ verified_token, is_new_user: isNew, terms_agreed });
  } catch (e: any) {
    if (e?.message === "email required for new Apple user") {
      return apiError("email is required for first-time Apple Sign In", 400);
    }
    console.error("apple oauth error:", e);
    return apiError("Server error", 500);
  }
}
