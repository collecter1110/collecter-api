import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

type Params = { params: Promise<{ collectionId: string }> };

// POST /api/collections/:collectionId/like — actionLike
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { collectionId: idParam } = await params;
  const collectionId = parseInt(idParam, 10);

  if (isNaN(collectionId)) {
    return NextResponse.json({ error: "Invalid collection ID" }, { status: 400 });
  }

  const { error } = await getSupabase().from("likes").insert({
    user_id: auth.userId,
    collection_id: collectionId,
  });

  if (error) {
    console.error("actionLike error:", error);
    return NextResponse.json({ error: "Failed to like" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/collections/:collectionId/like — actionUnlike
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { collectionId: idParam } = await params;
  const collectionId = parseInt(idParam, 10);

  if (isNaN(collectionId)) {
    return NextResponse.json({ error: "Invalid collection ID" }, { status: 400 });
  }

  const { error } = await getSupabase()
    .from("likes")
    .delete()
    .eq("user_id", auth.userId)
    .eq("collection_id", collectionId);

  if (error) {
    console.error("actionUnlike error:", error);
    return NextResponse.json({ error: "Failed to unlike" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
