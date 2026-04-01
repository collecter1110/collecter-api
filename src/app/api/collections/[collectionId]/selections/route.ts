import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireAuth, getAuthContext } from "@/lib/auth";
import { uploadImageAndSave } from "@/lib/storage";

type Params = { params: Promise<{ collectionId: string }> };

// GET /api/collections/:collectionId/selections — getSelections
export async function GET(request: NextRequest, { params }: Params) {
  const { collectionId: idParam } = await params;
  const collectionId = parseInt(idParam, 10);

  if (isNaN(collectionId)) {
    return NextResponse.json({ error: "Invalid collection ID" }, { status: 400 });
  }

  const auth = await getAuthContext(request);

  const { data: collection, error: collectionError } = await getSupabase()
    .from("collections")
    .select("user_id, is_public")
    .eq("id", collectionId)
    .single();

  if (collectionError) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  if (!collection.is_public && auth?.userId !== collection.user_id) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  const { data, error } = await getSupabase()
    .from("selections")
    .select(
      `category_id, collection_id, selection_id, title, keywords, owner_name, owner_id, is_selecting,
       selection_images(image_id, sort_order, images(file_path))`
    )
    .eq("collection_id", collectionId);

  if (error) {
    console.error("getSelections error:", error);
    return NextResponse.json({ error: "Failed to fetch selections" }, { status: 500 });
  }

  const selections = (data ?? []).map((item) => {
    const imgs = (item.selection_images as unknown as { image_id: string; sort_order: number; images: { file_path: string }[] }[])
      .sort((a, b) => a.sort_order - b.sort_order);
    return {
      ...item,
      thumb_file_path: imgs[0]?.images?.[0]?.file_path ?? null,
    };
  });

  return NextResponse.json({ selections });
}

// POST /api/collections/:collectionId/selections — addSelections
// body: multipart/form-data { category_id, title, description?, images?, keywords?, link?, items?, is_ordered?, is_selectable? }
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { collectionId: idParam } = await params;
  const collectionId = parseInt(idParam, 10);

  if (isNaN(collectionId)) {
    return NextResponse.json({ error: "Invalid collection ID" }, { status: 400 });
  }

  const formData = await request.formData();
  const category_id = parseInt(formData.get("category_id") as string, 10);
  const title = formData.get("title") as string | null;
  const description = (formData.get("description") as string | null) ?? null;
  const keywordsRaw = formData.get("keywords") as string | null;
  const keywords = keywordsRaw ? JSON.parse(keywordsRaw) : [];
  const link = (formData.get("link") as string | null) ?? null;
  const itemsRaw = formData.get("items") as string | null;
  const items = itemsRaw ? JSON.parse(itemsRaw) : null;
  const is_ordered = formData.get("is_ordered") === "true";
  const is_selectable = formData.get("is_selectable") !== "false";
  const imageFiles = formData.getAll("images") as File[];

  if (!category_id || !title) {
    return NextResponse.json(
      { error: "category_id and title are required" },
      { status: 400 }
    );
  }

  const { data: newSelection, error } = await getSupabase()
    .from("selections")
    .insert({
      category_id,
      owner_id: auth.userId,
      user_id: auth.userId,
      collection_id: collectionId,
      selection_id: null,
      title,
      description,
      keywords,
      link,
      items,
      is_ordered,
      is_selectable,
    })
    .select("collection_id, selection_id")
    .single();

  if (error || !newSelection) {
    console.error("addSelections error:", error);
    return NextResponse.json({ error: "Failed to create selection" }, { status: 500 });
  }

  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    if (!file || file.size === 0) continue;
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const { imageId } = await uploadImageAndSave(
        buffer,
        file.type,
        `users/${auth.userId}/selections`
      );
      await getSupabase().from("selection_images").insert({
        collection_id: newSelection.collection_id,
        selection_id: newSelection.selection_id,
        image_id: imageId,
        sort_order: i,
      });
    } catch (err) {
      console.error("Failed to upload selection image:", err);
    }
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
