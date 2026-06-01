import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { randomOtpCode, saveOtpIntent, checkOtpSendRateLimit } from "@/lib/authStore";
import { sendOtpEmail } from "@/lib/mail";

/**
 * @openapi
 * /auth/otp/send:
 *   post:
 *     tags: [Auth]
 *     summary: OTP 이메일 전송
 *     description: 이메일로 OTP 코드를 발송합니다. 회원가입/로그인 공통으로 사용합니다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               shouldCreateUser:
 *                 type: boolean
 *                 description: 회원가입이면 true, 로그인이면 false (기본값)
 *           examples:
 *             login:
 *               summary: 로그인용 OTP
 *               value:
 *                 email: user@example.com
 *                 shouldCreateUser: false
 *             signup:
 *               summary: 회원가입용 OTP
 *               value:
 *                 email: newuser@example.com
 *                 shouldCreateUser: true
 *     responses:
 *       200:
 *         description: OTP 전송 성공
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
 *         description: email 누락
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: email is required
 *                   data: {}
 *       429:
 *         description: 요청 횟수 초과
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               too_many:
 *                 value:
 *                   errorCode: SU005
 *                   msg: Too many requests. Please retry after 60 seconds
 *                   data: {}
 *       500:
 *         description: OTP 전송 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to send OTP
 *                   data: {}
 */
// POST /auth/otp/send
// sendOtp (회원가입) + emailLogin (로그인) 통합 (Local Auth)
// body: { email: string, shouldCreateUser?: boolean }
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { email, shouldCreateUser = false } = body;

  if (!email) {
    return apiError("email is required", 400);
  }

  const sendLimit = checkOtpSendRateLimit(String(email));
  if (!sendLimit.allowed) {
    return apiError(`Too many requests. Please retry after ${sendLimit.retryAfterSeconds} seconds`, 429, "SU005");
  }

  const code = randomOtpCode();
  const ttlSeconds = Number(process.env.AUTH_OTP_TTL_SECONDS ?? 180);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  try {
    await saveOtpIntent({
      email,
      create_user: Boolean(shouldCreateUser),
      code,
      expiresAt,
    });
    await sendOtpEmail(String(email), code);
  } catch (e) {
    console.error("sendOtp error:", e);
    return apiError("Failed to send OTP", 500);
  }

  return apiResponse({ success: true });
}
