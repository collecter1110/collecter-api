import { NextRequest, NextResponse } from "next/server";
import { randomOtpCode, saveOtpIntent } from "@/lib/authStore";
import { sendOtpEmail } from "@/lib/mail";

// POST /api/auth/otp/send
// sendOtp (회원가입) + emailLogin (로그인) 통합 (Local Auth)
// body: { email: string, shouldCreateUser?: boolean }
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { email, shouldCreateUser = false } = body;

  if (!email) {
    return NextResponse.json(
      { error: "email is required" },
      { status: 400 }
    );
  }

  const code = randomOtpCode();
  const ttlSeconds = Number(process.env.AUTH_OTP_TTL_SECONDS ?? 600);
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
    return NextResponse.json({ error: "Failed to send OTP" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
