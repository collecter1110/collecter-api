import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

type Params = { params: Promise<{ collectionId: string }> };

// GET /api/collections/:collectionId/selections — getSelections
export async function GET(
  _request: NextRequest,
  { params }: Params
) {
  const { collectionId: idParam } = await params;
  const collectionId = parseInt(idParam, 10);

  if (isNaN(collectionId)) {
    return NextResponse.json({ error: "Invalid collection ID" }, { status: 400 });
  }

  const { data, error } = await getSupabase()
    .from("selections")
    .select(
      "category_id, collection_id, selection_id, title, image_file_paths, keywords, owner_name, owner_id, is_selecting"
    )
    .eq("collection_id", collectionId);

  if (error) {
    console.error("getSelections error:", error);
    return NextResponse.json({ error: "Failed to fetch selections" }, { status: 500 });
  }

  const selections = (data ?? []).map((item) => {
    const paths = item.image_file_paths as string[] | null;
    return {
      ...item,
      thumb_file_path: paths && paths.length > 0 ? paths[0] : null,
    };
  });

  return NextResponse.json({ selections });
}

// POST /api/collections/:collectionId/selections — addSelections
// body: { category_id, title, description?, image_file_paths?, keywords, link?, items?, is_ordered, is_selectable }
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { collectionId: idParam } = await params;
  const collectionId = parseInt(idParam, 10);

  if (isNaN(collectionId)) {
    return NextResponse.json({ error: "Invalid collection ID" }, { status: 400 });
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

  if (!category_id || !title) {
    return NextResponse.json(
      { error: "category_id and title are required" },
      { status: 400 }
    );
  }

  const { error } = await getSupabase().from("selections").insert({
    category_id,
    owner_id: auth.userId,
    user_id: auth.userId,
    collection_id: collectionId,
    selection_id: null,
    title,
    description: description ?? null,
    image_file_paths: image_file_paths ?? null,
    keywords: keywords ?? [],
    link: link ?? null,
    items: items ?? null,
    is_ordered: is_ordered ?? false,
    is_selectable: is_selectable ?? true,
  });

  if (error) {
    console.error("addSelections error:", error);
    return NextResponse.json({ error: "Failed to create selection" }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
