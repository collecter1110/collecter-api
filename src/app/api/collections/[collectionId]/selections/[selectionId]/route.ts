import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { callEdgeFunction } from "@/lib/edge";

type Params = { params: Promise<{ collectionId: string; selectionId: string }> };

// GET /api/collections/:collectionId/selections/:selectionId — getSelectionDetail
export async function GET(
  _request: NextRequest,
  { params }: Params
) {
  const { collectionId: cIdParam, selectionId: sIdParam } = await params;
  const collectionId = parseInt(cIdParam, 10);
  const selectionId = parseInt(sIdParam, 10);

  if (isNaN(collectionId) || isNaN(selectionId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const { data, error } = await getSupabase()
    .from("selections")
    .select(
      "category_id, collection_id, selection_id, user_id, owner_id, title, description, image_file_paths, is_ordered, link, items, keywords, created_at, owner_name, is_selectable, is_selecting"
    )
    .eq("collection_id", collectionId)
    .eq("selection_id", selectionId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Selection not found" }, { status: 404 });
    }
    console.error("getSelectionDetail error:", error);
    return NextResponse.json({ error: "Failed to fetch selection" }, { status: 500 });
  }

  return NextResponse.json({ selection: data });
}

// PATCH /api/collections/:collectionId/selections/:selectionId — editSelection
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { collectionId: cIdParam, selectionId: sIdParam } = await params;
  const collectionId = parseInt(cIdParam, 10);
  const selectionId = parseInt(sIdParam, 10);

  if (isNaN(collectionId) || isNaN(selectionId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await request.json();
  const {
    category_id,
    title,
    description,
    image_file_paths,
    keywords,
    link,
    items,
    is_ordered,
    is_selectable,
  } = body;

  const { error } = await getSupabase()
    .from("selections")
    .update({
      category_id,
      title,
      description,
      image_file_paths,
      keywords,
      link,
      items,
      is_ordered,
      is_selectable,
    })
    .eq("collection_id", collectionId)
    .eq("selection_id", selectionId);

  if (error) {
    console.error("editSelection error:", error);
    return NextResponse.json({ error: "Failed to update selection" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/collections/:collectionId/selections/:selectionId — deleteSelection
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { collectionId: cIdParam, selectionId: sIdParam } = await params;
  const collectionId = parseInt(cIdParam, 10);
  const selectionId = parseInt(sIdParam, 10);

  if (isNaN(collectionId) || isNaN(selectionId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  // 이미지 삭제 (is_selecting 아닌 경우만)
  const { data: selection } = await getSupabase()
    .from("selections")
    .select("image_file_paths, is_selecting")
    .eq("collection_id", collectionId)
    .eq("selection_id", selectionId)
    .single();

  if (selection && !selection.is_selecting && selection.image_file_paths?.length > 0) {
    const filePaths = (selection.image_file_paths as string[]).map(
      (fp) => `${auth.userId}/selections/${fp}`
    );
    await callEdgeFunction("delete-images", auth.accessToken, { filePaths });
  }

  const { error } = await getSupabase()
    .from("selections")
    .delete()
    .eq("collection_id", collectionId)
    .eq("selection_id", selectionId);

  if (error) {
    console.error("deleteSelection error:", error);
    return NextResponse.json({ error: "Failed to delete selection" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
