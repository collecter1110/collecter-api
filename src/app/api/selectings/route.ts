import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

// GET /api/selectings?properties=... — getSelectings
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const properties = request.nextUrl.searchParams.get("properties") ?? "*";

  const { data, error } = await getSupabase()
    .from("selectingview")
    .select(properties)
    .eq("user_id", auth.userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ selectings: [] });
    }
    console.error("getSelectings error:", error);
    return NextResponse.json({ error: "Failed to fetch selectings" }, { status: 500 });
  }

  // Client 호환성: 항상 배열 형태로 반환
  return NextResponse.json({ selectings: data ? [data] : [] });
}

// POST /api/selectings — selecting (셀렉션 퍼오기)
// body: { category_id, selecting_collection_id, selected_collection_id, selected_selection_id, owner_id }
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const {
    category_id,
    selecting_collection_id,
    selected_collection_id,
    selected_selection_id,
  } = body;

  // 원본 셀렉션 조회
  const { data: selectedSelection, error: fetchError } = await getSupabase()
    .from("selections")
    .select("*")
    .eq("collection_id", selected_collection_id)
    .eq("selection_id", selected_selection_id)
    .single();

  if (fetchError || !selectedSelection) {
    return NextResponse.json({ error: "Source selection not found" }, { status: 404 });
  }

  // 이미 selecting인 경우 원본 추적
  let finalCollectionId = selected_collection_id;
  let finalSelectionId = selected_selection_id;
  const finalOwnerId = selectedSelection.owner_id;

  if (selectedSelection.is_selecting === true) {
    const { data: selectingData } = await getSupabase()
      .from("selecting")
      .select("selected_collection_id, selected_selection_id")
      .eq("uuid", selectedSelection.selecting_uuid)
      .single();

    if (selectingData) {
      finalCollectionId = selectingData.selected_collection_id;
      finalSelectionId = selectingData.selected_selection_id;
    }
  }

  // 새 셀렉션 삽입
  const { data: newData, error: insertError } = await getSupabase()
    .from("selections")
    .insert({
      category_id,
      collection_id: selecting_collection_id,
      selection_id: null,
      owner_id: selectedSelection.owner_id,
      user_id: auth.userId,
      title: selectedSelection.title,
      description: selectedSelection.description,
      image_file_paths: selectedSelection.image_file_paths,
      keywords: selectedSelection.keywords,
      link: selectedSelection.link,
      items: selectedSelection.items,
      is_ordered: selectedSelection.is_ordered,
      is_selectable: selectedSelection.is_selectable,
      is_selecting: true,
    })
    .select()
    .single();

  if (insertError || !newData) {
    console.error("selecting insert error:", insertError);
    return NextResponse.json({ error: "Failed to create selecting" }, { status: 500 });
  }

  // selecting 테이블 업데이트
  const { error: updateError } = await getSupabase()
    .from("selecting")
    .update({
      selected_collection_id: finalCollectionId,
      selected_selection_id: finalSelectionId,
      selected_user_id: finalOwnerId,
    })
    .eq("uuid", newData.selecting_uuid);

  if (updateError) {
    console.error("selecting update error:", updateError);
    return NextResponse.json({ error: "Failed to update selecting" }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
