import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// GET /api/collections/:collectionId/title — getCollectionTitle
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  const { collectionId: idParam } = await params;
  const collectionId = parseInt(idParam, 10);

  if (isNaN(collectionId)) {
    return NextResponse.json({ error: "Invalid collection ID" }, { status: 400 });
  }

  const { data, error } = await getSupabase()
    .from("collections")
    .select("title")
    .eq("id", collectionId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }
    console.error("getCollectionTitle error:", error);
    return NextResponse.json({ error: "Failed to fetch title" }, { status: 500 });
  }

  return NextResponse.json({ title: data.title });
}
