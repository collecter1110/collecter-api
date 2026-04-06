import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// GET /api/auth/check-username?username=...
// success: true → 사용 가능
export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username");

  if (!username) {
    return NextResponse.json(
      { error: "username parameter is required" },
      { status: 400 }
    );
  }

  const { data, error } = await getSupabase()
    .from("userinfo")
    .select("name")
    .eq("name", username)
    .maybeSingle();

  if (error) {
    console.error("checkUserNameDuplicate error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  return NextResponse.json({ success: data === null });
}
