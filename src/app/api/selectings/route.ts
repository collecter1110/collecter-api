import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

/**
 * @openapi
 * /api/selectings:
 *   get:
 *     tags: [Selectings]
 *     summary: 내 셀렉팅 목록 조회
 *     description: |
 *       `selectingview`에서 내가 퍼온 셀렉션(selectings) 목록을 조회합니다.
 *       `properties` 파라미터로 조회할 컬럼을 지정할 수 있습니다. (기본값: `*`)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: properties
 *         required: false
 *         schema:
 *           type: string
 *           default: "*"
 *         description: 조회할 컬럼 목록 (Supabase select 문법)
 *         example: "user_id,collection_id,selection_id"
 *     responses:
 *       200:
 *         description: 셀렉팅 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [selectings]
 *               properties:
 *                 selectings:
 *                   type: array
 *                   items:
 *                     type: object
 *             examples:
 *               ok:
 *                 value:
 *                   selectings:
 *                     - user_id: 45
 *                       collection_id: 123
 *                       selection_id: 456
 *                       selecting_collection_id: 200
 *                       selected_collection_id: 123
 *                       selected_selection_id: 456
 *                       selected_user_id: 99
 *                       title: 퍼온 셀렉션
 *                       owner_id: 99
 *                       owner_name: otheruser
 *                       is_selecting: true
 *               empty:
 *                 summary: 셀렉팅 없음
 *                 value:
 *                   selectings: []
 *       401:
 *         description: 인증 필요
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: Unauthorized
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: Failed to fetch selectings
 *   post:
 *     tags: [Selectings]
 *     summary: 셀렉션 퍼오기 (selecting)
 *     description: |
 *       다른 유저의 셀렉션을 내 컬렉션으로 퍼옵니다.
 *       이미 퍼온 셀렉션(is_selecting=true)인 경우 원본을 추적해 저장합니다.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category_id, selecting_collection_id, selected_collection_id, selected_selection_id]
 *             properties:
 *               category_id:
 *                 type: integer
 *                 description: 내 컬렉션의 카테고리 ID
 *               selecting_collection_id:
 *                 type: integer
 *                 description: 퍼올 내 컬렉션 ID
 *               selected_collection_id:
 *                 type: integer
 *                 description: 원본 컬렉션 ID
 *               selected_selection_id:
 *                 type: integer
 *                 description: 원본 셀렉션 ID
 *           examples:
 *             ok:
 *               value:
 *                 category_id: 1
 *                 selecting_collection_id: 200
 *                 selected_collection_id: 123
 *                 selected_selection_id: 456
 *     responses:
 *       201:
 *         description: 셀렉팅 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success]
 *               properties:
 *                 success:
 *                   type: boolean
 *             examples:
 *               ok:
 *                 value:
 *                   success: true
 *       401:
 *         description: 인증 필요
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: Unauthorized
 *       404:
 *         description: 원본 셀렉션을 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: Source selection not found
 *       500:
 *         description: 셀렉팅 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: Failed to create selecting
 */
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
