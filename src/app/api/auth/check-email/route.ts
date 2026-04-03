import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// GET /api/auth/check-email?email=...
// success: true = 사용 가능, false = 이미 존재
export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email");

  if (!email) {
    return NextResponse.json(
      { error: "email parameter is required" },
      { status: 400 }
    );
  }

  const { data, error } = await getSupabase()
    .from("userinfo")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    console.error("checkEmailDuplicate error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  return NextResponse.json({ success: data === null });
}
