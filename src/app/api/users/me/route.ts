import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

// GET /api/users/me — getUserInfo
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await getSupabase()
    .from("userinfo")
    .select("user_id, name, email, description, image_file_path")
    .eq("user_id", auth.userId)
    .single();

  if (error) {
    console.error("getUserInfo error:", error);
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
  }

  return NextResponse.json({ user: data });
}

// PATCH /api/users/me — editUserInfo
// body: { name: string, description?: string, image_file_path?: string }
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { name, description, image_file_path } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const { error } = await getSupabase()
    .from("userinfo")
    .update({
      name,
      description: description ?? null,
      image_file_path: image_file_path ?? null,
    })
    .eq("user_id", auth.userId);

  if (error) {
    console.error("editUserInfo error:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
