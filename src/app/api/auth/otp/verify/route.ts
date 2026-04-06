import { NextRequest, NextResponse } from "next/server";
import { consumeOtp, getOrCreateUserIdByEmail } from "@/lib/authStore";
import { signVerifiedToken } from "@/lib/jwt";

/**
 * @openapi
 * /api/auth/otp/verify:
 *   post:
 *     tags: [Auth]
 *     summary: OTP 검증
 *     description: |
 *       이메일로 받은 OTP 코드를 검증하고 단기 `verified_token`을 반환합니다.
 *       - 기존 유저: `/api/auth/login`에 `verified_token` 전달
 *       - 신규 유저: `/api/signup`에 `verified_token` 전달
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
 *               required: [verified_token, is_new_user]
 *               properties:
 *                 verified_token:
 *                   type: string
 *                 is_new_user:
 *                   type: boolean
 *             examples:
 *               existing_user:
 *                 summary: 기존 유저
 *                 value:
 *                   verified_token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXAiOiJ2ZXJpZmllZCIsInVzZXJfaWQiOjQ1LCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20ifQ.signature
 *                   is_new_user: false
 *               new_user:
 *                 summary: 신규 유저
 *                 value:
 *                   verified_token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXAiOiJ2ZXJpZmllZCIsInVzZXJfaWQiOjQ2LCJlbWFpbCI6Im5ld3VzZXJAZXhhbXBsZS5jb20ifQ.signature
 *                   is_new_user: true
 *       400:
 *         description: 잘못된 OTP 또는 파라미터
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               invalid_otp:
 *                 value:
 *                   error: Invalid OTP
 *       404:
 *         description: 유저 정보 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               not_found:
 *                 value:
 *                   error: User info not found
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: Server error
 */
// POST /api/auth/otp/verify
// body: { email: string, token: string }
// OTP 검증 후 단기 verified_token 반환 — 이후 /api/auth/login 또는 /api/signup 에서 실제 토큰 발급
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { email, token } = body;

  if (!email || !token) {
    return NextResponse.json({ error: "email and token are required" }, { status: 400 });
  }

  try {
    const consumed = await consumeOtp({ email: String(email), code: String(token) });
    if (!consumed) {
      return NextResponse.json({ error: "Invalid OTP" }, { status: 400 });
    }

    const userId = await getOrCreateUserIdByEmail({
      email: consumed.email,
      createIfMissing: consumed.create_user,
    });

    if (!userId) {
      return NextResponse.json({ error: "User info not found" }, { status: 404 });
    }

    const verified_token = await signVerifiedToken({
      typ: "verified",
      user_id: userId,
      email: consumed.email,
    });

    return NextResponse.json({ verified_token, is_new_user: consumed.create_user });
  } catch (e) {
    console.error("verifyOtp error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
