import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

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

  const supabaseUrl = process.env.SUPABASE_URL!;
  const anonKey = process.env.SUPABASE_ANON_KEY!;

  // Supabase Auth REST API로 OTP 검증
  const response = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
    },
    body: JSON.stringify({ type: "email", email, token }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.error("verifyOtp error:", err);
    return NextResponse.json(
      { error: err.msg || "Invalid OTP" },
      { status: response.status }
    );
  }

  const session = await response.json();
  // session: { access_token, refresh_token, user, ... }

  // userinfo에서 integer user_id 조회
  const { data: userInfo, error: dbError } = await getSupabase()
    .from("userinfo")
    .select("user_id")
    .eq("email", email)
    .single();

  if (dbError || !userInfo) {
    return NextResponse.json(
      { error: "User info not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    user_id: userInfo.user_id,
    user: session.user,
  });
}
