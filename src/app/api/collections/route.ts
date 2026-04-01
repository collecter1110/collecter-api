import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { uploadImageAndSave } from "@/lib/storage";

// POST /api/collections — addCollection
// body: multipart/form-data { category_id, title, description?, tags?, is_public?, image? }
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const formData = await request.formData();
  const category_id = parseInt(formData.get("category_id") as string, 10);
  const title = formData.get("title") as string | null;
  const description = (formData.get("description") as string | null) ?? null;
  const tagsRaw = formData.get("tags") as string | null;
  const tags = tagsRaw ? JSON.parse(tagsRaw) : null;
  const is_publicRaw = formData.get("is_public") as string | null;
  const is_public = is_publicRaw !== null ? is_publicRaw !== "false" : true;
  const imageFile = formData.get("image") as File | null;

  if (!category_id || !title) {
    return NextResponse.json(
      { error: "category_id and title are required" },
      { status: 400 }
    );
  }

  let image_id: string | null = null;
  if (imageFile && imageFile.size > 0) {
    try {
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      const result = await uploadImageAndSave(
        buffer,
        imageFile.type,
        `users/${auth.userId}/collections`
      );
      image_id = result.imageId;
    } catch {
      return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
    }
  }

  const { error } = await getSupabase().from("collections").insert({
    category_id,
    user_id: auth.userId,
    title,
    description,
    tags,
    is_public,
    image_id,
  });

  if (error) {
    console.error("addCollection error:", error);
    return NextResponse.json(
      { error: "Failed to create collection" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
