import { NextRequest, NextResponse } from "next/server";

// POST /api/auth/otp/send
// sendOtp (회원가입) + emailLogin (로그인) 통합
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

  const supabaseUrl = process.env.SUPABASE_URL!;
  const anonKey = process.env.SUPABASE_ANON_KEY!;

  const response = await fetch(`${supabaseUrl}/auth/v1/otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
    },
    body: JSON.stringify({
      email,
      create_user: shouldCreateUser,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.error("sendOtp error:", err);
    return NextResponse.json(
      { error: err.msg || "Failed to send OTP" },
      { status: response.status }
    );
  }

  return NextResponse.json({ success: true });
}
