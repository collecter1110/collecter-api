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

// POST /api/users/me — setUserInfo (초기 프로필 설정)
// body: { name: string, description?: string }
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { name, description } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const {
    data: { user },
  } = await getSupabase().auth.getUser(auth.accessToken);

  if (!user?.email) {
    return NextResponse.json({ error: "User email not found" }, { status: 400 });
  }

  const { error } = await getSupabase()
    .from("userinfo")
    .update({ name, description: description ?? null })
    .eq("email", user.email);

  if (error) {
    console.error("setUserInfo error:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
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
