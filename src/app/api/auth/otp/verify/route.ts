import { NextRequest, NextResponse } from "next/server";
import { consumeOtp, getOrCreateUserIdByEmail } from "@/lib/authStore";
import { signVerifiedToken } from "@/lib/jwt";

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
