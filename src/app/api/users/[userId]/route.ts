import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { UserInfo } from "@/types/user";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId: userIdParam } = await params;
  const userId = parseInt(userIdParam, 10);

  if (isNaN(userId)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  const { data, error } = await getSupabase()
    .from("userinfo")
    .select("user_id, name, description, image_file_path")
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.error("getOtherUserInfo error:", error);
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 500 }
    );
  }

  const user: UserInfo = data;

  return NextResponse.json({ user });
}
