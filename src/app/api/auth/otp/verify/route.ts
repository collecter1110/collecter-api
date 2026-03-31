import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import {
  consumeOtp,
  createRefreshSession,
  getOrCreateUserIdByEmail,
  newSessionId,
} from "@/lib/authStore";
import { signAccessToken, signRefreshToken } from "@/lib/jwt";

// POST /api/auth/otp/verify
// checkOtp: OTP 검증 후 세션 반환
// body: { email: string, token: string }
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { email, token } = body;

  if (!email || !token) {
    return NextResponse.json(
      { error: "email and token are required" },
      { status: 400 }
    );
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

    const sessionId = newSessionId();
    const access_token = await signAccessToken({
      typ: "access",
      user_id: userId,
      email: consumed.email,
    });
    const refresh_token = await signRefreshToken({
      typ: "refresh",
      sid: sessionId,
      user_id: userId,
      email: consumed.email,
    });

    const refreshTtl = Number(process.env.AUTH_REFRESH_TOKEN_TTL_SECONDS ?? 60 * 60 * 24 * 30);
    await createRefreshSession({
      session_id: sessionId,
      user_id: userId,
      email: consumed.email,
      refresh_token,
      expiresAt: new Date(Date.now() + refreshTtl * 1000),
    });

    // 기존 응답 shape 유지용 (client가 user object를 기대하는 경우)
    const { data: userRow } = await getSupabase()
      .from("userinfo")
      .select("user_id, name, email, description, image_file_path")
      .eq("user_id", userId)
      .maybeSingle();

    return NextResponse.json({
      access_token,
      refresh_token,
      user_id: userId,
      user: userRow ?? { user_id: userId, email: consumed.email },
    });
  } catch (e) {
    console.error("verifyOtp error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
