import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
// TODO: 임시로 무조건 ok 반환 — 실제 signup 로직 복원 필요 (import { getSupabase } from "@/lib/supabase"; 복원)

// POST /api/signup
// body: { name: string, email: string, description?: string, image_file_path?: string }
// Updates the current (token) user's profile fields and returns { ok: true }.
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ ok: true, access_token: auth.accessToken });

  // TODO: 아래 로직 복원 필요
  // const body = await request.json().catch(() => ({}));
  // const name = body?.name as string | undefined;
  // const email = body?.email as string | undefined;
  // const description = (body?.description as string | undefined) ?? null;
  // const image_file_path = (body?.image_file_path as string | undefined) ?? null;

  // if (!name || !email) {
  //   return NextResponse.json({ error: "name and email are required" }, { status: 400 });
  // }

  // if (String(email).toLowerCase() !== auth.email.toLowerCase()) {
  //   return NextResponse.json({ error: "email mismatch" }, { status: 400 });
  // }

  // const { data, error } = await getSupabase()
  //   .from("userinfo")
  //   .update({ name, email: auth.email.toLowerCase(), description, image_file_path })
  //   .eq("user_id", auth.userId)
  //   .select("user_id")
  //   .maybeSingle();

  // if (error) {
  //   console.error("signup error:", error);
  //   return NextResponse.json({ error: "Failed to signup" }, { status: 500 });
  // }

  // if (!data) {
  //   return NextResponse.json({ error: "User info not found" }, { status: 404 });
  // }

  // return NextResponse.json({ ok: true });
}
