import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

// POST /api/auth/logout
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { error } = await getSupabase().auth.admin.signOut(auth.accessToken);

  if (error) {
    console.error("logout error:", error);
    return NextResponse.json({ error: "Failed to logout" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
