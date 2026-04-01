import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { uploadImageAndSave, deleteImageById } from "@/lib/storage";

// GET /api/users/me — getUserInfo
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await getSupabase()
    .from("userinfo")
    .select("user_id, name, email, description, image_file_path, image_id, images(file_path)")
    .eq("user_id", auth.userId)
    .single();

  if (error) {
    console.error("getUserInfo error:", error);
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
  }

  return NextResponse.json({ user: data });
}

// PATCH /api/users/me — editUserInfo
// body: multipart/form-data { name, description?, image? }
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const formData = await request.formData();
  const name = formData.get("name") as string | null;
  const description = formData.get("description") as string | null;
  const imageFile = formData.get("image") as File | null;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    name,
    description: description ?? null,
  };

  if (imageFile && imageFile.size > 0) {
    const { data: old } = await getSupabase()
      .from("userinfo")
      .select("image_id")
      .eq("user_id", auth.userId)
      .single();

    if (old?.image_id) {
      await deleteImageById(old.image_id);
    }

    try {
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      const { imageId } = await uploadImageAndSave(
        buffer,
        imageFile.type,
        `users/${auth.userId}/profile`
      );
      updates.image_id = imageId;
    } catch {
      return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
    }
  }

  const { error } = await getSupabase()
    .from("userinfo")
    .update(updates)
    .eq("user_id", auth.userId);

  if (error) {
    console.error("editUserInfo error:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
