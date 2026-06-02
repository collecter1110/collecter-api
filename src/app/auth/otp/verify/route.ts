import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { consumeOtp, getOrCreateUserIdByEmail, checkOtpVerifyRateLimit, resetOtpVerifyRateLimit } from "@/lib/authStore";
import { signVerifiedToken } from "@/lib/jwt";

/**
 * @openapi
 * /auth/otp/verify:
 *   post:
 *     tags: [Auth]
 *     summary: OTP 검증
 *     description: |
 *       이메일로 받은 OTP 코드를 검증하고 단기 `verified_token`을 반환합니다.
 *       - 기존 유저: `/auth/login`에 `verified_token` 전달
 *       - 신규 유저: `/signup`에 `verified_token` 전달
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, token]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               token:
 *                 type: string
 *                 description: 6자리 OTP 코드
 *           examples:
 *             ok:
 *               value:
 *                 email: user@example.com
 *                 token: "123456"
 *     responses:
 *       200:
 *         description: OTP 검증 성공
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
 *                   description: 약관 동의 여부. false이면 클라이언트가 약관 화면을 표시하고 `/auth/login`에 `terms_agreed: true`를 전달해야 합니다.
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
 *         description: 잘못된 OTP 또는 파라미터
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               invalid_otp:
 *                 value:
 *                   errorCode: SU004
 *                   msg: Invalid OTP
 *                   data: {}
 *       429:
 *         description: 인증 시도 횟수 초과
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               too_many:
 *                 value:
 *                   errorCode: SU005
 *                   msg: Too many verification attempts. Please request a new OTP
 *                   data: {}
 *       404:
 *         description: 유저 정보 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               not_found:
 *                 value:
 *                   errorCode: SU006
 *                   msg: User info not found
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
// POST /auth/otp/verify
// body: { email: string, token: string }
// OTP 검증 후 단기 verified_token 반환 — 이후 /auth/login 또는 /signup 에서 실제 토큰 발급
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { email, token } = body;

  if (!email || !token) {
    return apiError("email and token are required", 400);
  }

  const verifyLimit = checkOtpVerifyRateLimit(String(email));
  if (!verifyLimit.allowed) {
    return apiError("Too many verification attempts. Please request a new OTP", 429, "SU005");
  }

  try {
    const consumed = await consumeOtp({ email: String(email), code: String(token) });
    if (!consumed) {
      return apiError("Invalid OTP", 400, "SU004");
    }

    resetOtpVerifyRateLimit(String(email));

    const userResult = await getOrCreateUserIdByEmail({
      email: consumed.email,
      createIfMissing: true,
    });

    if (!userResult) {
      return apiError("User info not found", 404, "SU006");
    }

    const { userId, terms_agreed } = userResult;

    const verified_token = await signVerifiedToken({
      typ: "verified",
      user_id: userId,
      email: consumed.email,
    });

    return apiResponse({ verified_token, is_new_user: consumed.create_user, terms_agreed });
  } catch (e) {
    console.error("verifyOtp error:", e);
    return apiError("Server error", 500);
  }
}
