import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

// PATCH /api/collections/:collectionId/selections/:selectionId/move — moveSelection
// body: { category_id: number, new_collection_id: number }
export async function PATCH(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ collectionId: string; selectionId: string }> }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { collectionId: cIdParam, selectionId: sIdParam } = await params;
  const collectionId = parseInt(cIdParam, 10);
  const selectionId = parseInt(sIdParam, 10);

  if (isNaN(collectionId) || isNaN(selectionId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await request.json();
  const { category_id, new_collection_id } = body;

  if (!new_collection_id) {
    return NextResponse.json(
      { error: "new_collection_id is required" },
      { status: 400 }
    );
  }

  const { error } = await getSupabase()
    .from("selections")
    .update({
      category_id,
      collection_id: new_collection_id,
      selection_id: null,
    })
    .eq("collection_id", collectionId)
    .eq("selection_id", selectionId);

  if (error) {
    console.error("moveSelection error:", error);
    return NextResponse.json(
      { error: "Failed to move selection" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
