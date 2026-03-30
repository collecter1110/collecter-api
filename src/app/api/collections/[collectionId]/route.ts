import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireAuth, getAuthContext } from "@/lib/auth";
import { callEdgeFunction } from "@/lib/edge";

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
      `category_id, id, title, description, created_at, image_file_path, tags,
       user_id, user_name, primary_keywords, selection_num, like_num,
       likes(user_id), is_public`
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

  const hasLiked = auth
    ? (data.likes as { user_id: number }[]).some((l) => l.user_id === auth.userId)
    : false;

  const { likes: _likes, ...rest } = data;
  return NextResponse.json({ collection: { ...rest, has_liked: hasLiked } });
}

// PATCH /api/collections/:collectionId — editCollection
// body: { category_id, title, description?, image_file_path?, tags?, is_public }
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { collectionId: idParam } = await params;
  const collectionId = parseInt(idParam, 10);
  if (isNaN(collectionId)) {
    return NextResponse.json({ error: "Invalid collection ID" }, { status: 400 });
  }

  const body = await request.json();
  const { category_id, title, description, image_file_path, tags, is_public } = body;

  const { error } = await getSupabase()
    .from("collections")
    .update({ category_id, title, description, image_file_path, tags, is_public })
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

  // 컬렉션 정보 조회
  const { data: collection, error: fetchError } = await getSupabase()
    .from("collections")
    .select("image_file_path, selection_num, user_id")
    .eq("id", collectionId)
    .single();

  if (fetchError) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  // 컬렉션 대표 이미지 삭제
  if (collection.image_file_path) {
    await callEdgeFunction("delete-images", auth.accessToken, {
      filePaths: [`${auth.userId}/collections/${collection.image_file_path}`],
    });
  }

  // 셀렉션 이미지들 삭제
  if (collection.selection_num > 0) {
    const { data: selectionImages } = await getSupabase()
      .from("selections")
      .select("image_file_paths")
      .eq("collection_id", collectionId)
      .eq("owner_id", collection.user_id);

    const imageFilePaths: string[] = [];
    for (const item of selectionImages ?? []) {
      if (item.image_file_paths) {
        for (const fp of item.image_file_paths) {
          imageFilePaths.push(`${auth.userId}/selections/${fp}`);
        }
      }
    }

    if (imageFilePaths.length > 0) {
      await callEdgeFunction("delete-images", auth.accessToken, {
        filePaths: imageFilePaths,
      });
    }
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
