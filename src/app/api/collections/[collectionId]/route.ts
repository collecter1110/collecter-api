import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireAuth, getAuthContext } from "@/lib/auth";
import { uploadImageAndSave, deleteImageById } from "@/lib/storage";

type Params = { params: Promise<{ collectionId: string }> };

// GET /api/collections/:collectionId — getCollectionDetail
export async function GET(request: NextRequest, { params }: Params) {
  const { collectionId: idParam } = await params;
  const collectionId = parseInt(idParam, 10);
  if (isNaN(collectionId)) {
    return NextResponse.json({ error: "Invalid collection ID" }, { status: 400 });
  }

  const auth = await getAuthContext(request);

  const { data, error } = await getSupabase()
    .from("collections")
    .select(
      `category_id, id, title, description, created_at, image_file_path, image_id,
       tags, user_id, user_name, primary_keywords, selection_num, like_num,
       likes(user_id), is_public, images(image_id, file_path)`
    )
    .eq("id", collectionId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }
    console.error("getCollectionDetail error:", error);
    return NextResponse.json({ error: "Failed to fetch collection" }, { status: 500 });
  }

  if (!data.is_public && auth?.userId !== data.user_id) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  const hasLiked = auth
    ? (data.likes as { user_id: number }[]).some((l) => l.user_id === auth.userId)
    : false;

  const { likes: _likes, ...rest } = data;
  return NextResponse.json({ collection: { ...rest, has_liked: hasLiked } });
}

// PATCH /api/collections/:collectionId — editCollection
// body: multipart/form-data { category_id?, title?, description?, image?, tags?, is_public? }
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { collectionId: idParam } = await params;
  const collectionId = parseInt(idParam, 10);
  if (isNaN(collectionId)) {
    return NextResponse.json({ error: "Invalid collection ID" }, { status: 400 });
  }

  const formData = await request.formData();
  const category_idRaw = formData.get("category_id") as string | null;
  const title = formData.get("title") as string | null;
  const description = formData.get("description") as string | null;
  const tagsRaw = formData.get("tags") as string | null;
  const is_publicRaw = formData.get("is_public") as string | null;
  const imageFile = formData.get("image") as File | null;

  const updates: Record<string, unknown> = {};
  if (category_idRaw) updates.category_id = parseInt(category_idRaw, 10);
  if (title !== null) updates.title = title;
  if (description !== null) updates.description = description;
  if (tagsRaw !== null) updates.tags = JSON.parse(tagsRaw);
  if (is_publicRaw !== null) updates.is_public = is_publicRaw !== "false";

  if (imageFile && imageFile.size > 0) {
    const { data: old } = await getSupabase()
      .from("collections")
      .select("image_id")
      .eq("id", collectionId)
      .single();

    if (old?.image_id) {
      await deleteImageById(old.image_id);
    }

    try {
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      const result = await uploadImageAndSave(
        buffer,
        imageFile.type,
        `users/${auth.userId}/collections`
      );
      updates.image_id = result.imageId;
    } catch {
      return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
    }
  }

  const { error } = await getSupabase()
    .from("collections")
    .update(updates)
    .eq("id", collectionId);

  if (error) {
    console.error("editCollection error:", error);
    return NextResponse.json({ error: "Failed to update collection" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/collections/:collectionId — deleteCollection
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { collectionId: idParam } = await params;
  const collectionId = parseInt(idParam, 10);
  if (isNaN(collectionId)) {
    return NextResponse.json({ error: "Invalid collection ID" }, { status: 400 });
  }

  const { data: collection, error: fetchError } = await getSupabase()
    .from("collections")
    .select("image_id, user_id")
    .eq("id", collectionId)
    .single();

  if (fetchError) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  // 컬렉션 대표 이미지 삭제
  if (collection.image_id) {
    await deleteImageById(collection.image_id);
  }

  // 셀렉션 이미지들 삭제 (selection_images → images cascade로 S3+DB 정리)
  const { data: selImgs } = await getSupabase()
    .from("selection_images")
    .select("image_id")
    .eq("collection_id", collectionId);

  for (const si of selImgs ?? []) {
    await deleteImageById(si.image_id);
  }

  const { error } = await getSupabase()
    .from("collections")
    .delete()
    .eq("id", collectionId);

  if (error) {
    console.error("deleteCollection error:", error);
    return NextResponse.json({ error: "Failed to delete collection" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
