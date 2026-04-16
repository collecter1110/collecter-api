import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { ensureCollectionCoverIfEmpty } from "@/lib/collectionCover";

/**
 * @openapi
 * /selectings:
 *   get:
 *     tags: [Selectings]
 *     summary: 내가 셀렉팅한 목록 조회
 *     description: |
 *       `selecting` 테이블에서 내가 다른 유저의 셀렉션을 퍼온(selecting) 목록을 조회합니다.
 *       토큰에서 user_id를 파싱하여 `selecting_user_id`로 필터합니다.
 *     security:
 *       - bearerAuth: []
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
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     selectings:
 *                       - created_date: "2026-04-15"
 *                         selections:
 *                           - created_time: "16:31:27"
 *                             selection_name: "일인칭 단수"
 *                             user_name: "iris3455"
 *                             image_id: null
 *                             owner_name: "siriya"
 *                             owner_id: 69
 *                             collection_id: 636
 *                             selection_id: 5
 *               empty:
 *                 summary: 셀렉팅 없음
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     selectings: []
 *       401:
 *         description: 인증 필요
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *   post:
 *     tags: [Selectings]
 *     summary: 셀렉션 퍼오기 (selecting)
 *     description: |
 *       다른 유저의 셀렉션을 내 컬렉션으로 퍼옵니다.
 *       이미 퍼온 셀렉션(is_selecting=true)인 경우 원본을 추적해 저장합니다.
 *       원본의 `selection_images`를 새 셀렉션으로 복사하며(동일 image_id 공유),
 *       퍼온 컬렉션에 커버가 없으면 첫 이미지로 자동 설정합니다.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [selecting_collection_id, selected_collection_id, selected_selection_id]
 *             properties:
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
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     success: true
 *       401:
 *         description: 인증 필요
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Unauthorized
 *                   data: {}
 *       404:
 *         description: 원본 셀렉션을 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Source selection not found
 *                   data: {}
 *       500:
 *         description: 셀렉팅 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to create selecting
 *                   data: {}
 */
// GET /selectings — 내가 셀렉팅한 목록
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await getSupabase()
    .from("selecting")
    .select("selecting_collection_id, selecting_selection_id, selected_user_id, created_at")
    .eq("selecting_user_id", auth.userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getSelectings error:", error);
    return apiError("Failed to fetch selectings", 500);
  }

  if (!data || data.length === 0) {
    return apiResponse({ selectings: [] });
  }

  // 셀렉션 제목 + image_id 조회
  const selectionKeys = data.map((r) => ({
    collection_id: r.selecting_collection_id,
    selection_id: r.selecting_selection_id,
  }));

  const { data: selections } = await getSupabase()
    .from("selections")
    .select("collection_id, selection_id, title, owner_id, owner_name, selection_images(image_id, sort_order)")
    .in(
      "collection_id",
      [...new Set(selectionKeys.map((k) => k.collection_id))]
    )
    .in(
      "selection_id",
      [...new Set(selectionKeys.map((k) => k.selection_id))]
    );

  const selectionMap = new Map<string, {
    title: string;
    owner_id: number;
    owner_name: string;
    image_id: string | null;
  }>();

  for (const s of selections ?? []) {
    const imgs = (s.selection_images as { image_id: string; sort_order: number }[])
      .sort((a, b) => a.sort_order - b.sort_order);
    selectionMap.set(`${s.collection_id}-${s.selection_id}`, {
      title: s.title,
      owner_id: s.owner_id,
      owner_name: s.owner_name,
      image_id: imgs[0]?.image_id ?? null,
    });
  }

  // 현재 유저 이름 조회
  const { data: userInfo } = await getSupabase()
    .from("userinfo")
    .select("name")
    .eq("user_id", auth.userId)
    .single();

  const userName = userInfo?.name ?? "";

  // 날짜별 그룹핑
  const grouped = new Map<string, Array<Record<string, unknown>>>();

  for (const row of data) {
    const createdAt = new Date(row.created_at);
    const dateStr = createdAt.toISOString().slice(0, 10); // YYYY-MM-DD
    const timeStr = createdAt.toTimeString().slice(0, 8);  // HH:MM:SS

    const key = `${row.selecting_collection_id}-${row.selecting_selection_id}`;
    const sel = selectionMap.get(key);

    const item = {
      created_time: timeStr,
      selection_name: sel?.title ?? "",
      user_name: userName,
      image_id: sel?.image_id ?? null,
      owner_name: sel?.owner_name ?? "",
      owner_id: sel?.owner_id ?? null,
      collection_id: row.selecting_collection_id,
      selection_id: row.selecting_selection_id,
    };

    if (!grouped.has(dateStr)) {
      grouped.set(dateStr, []);
    }
    grouped.get(dateStr)!.push(item);
  }

  const selectings = Array.from(grouped.entries()).map(([date, selections]) => ({
    created_date: date,
    selections,
  }));

  return apiResponse({ selectings });
}

// POST /selectings — selecting (셀렉션 퍼오기)
// body: { selecting_collection_id, selected_collection_id, selected_selection_id }
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const {
    selecting_collection_id,
    selected_collection_id,
    selected_selection_id,
  } = body;

  // 퍼올 컬렉션의 category_id 조회
  const { data: targetCollection, error: colError } = await getSupabase()
    .from("collections")
    .select("category_id")
    .eq("id", selecting_collection_id)
    .single();

  if (colError || !targetCollection) {
    return apiError("Target collection not found", 404);
  }

  const category_id = targetCollection.category_id;

  // 원본 셀렉션 조회
  const { data: selectedSelection, error: fetchError } = await getSupabase()
    .from("selections")
    .select("*")
    .eq("collection_id", selected_collection_id)
    .eq("selection_id", selected_selection_id)
    .single();

  if (fetchError || !selectedSelection) {
    return apiError("Source selection not found", 404);
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
    return apiError("Failed to create selecting", 500);
  }

  // selecting 테이블에 직접 삽입
  const { error: selectingError } = await getSupabase()
    .from("selecting")
    .insert({
      uuid: newData.selecting_uuid,
      selecting_collection_id,
      selecting_selection_id: newData.selection_id,
      selecting_user_id: auth.userId,
      selected_collection_id: finalCollectionId,
      selected_selection_id: finalSelectionId,
      selected_user_id: finalOwnerId,
    });

  if (selectingError) {
    console.error("selecting insert error:", selectingError);
    return apiError("Failed to create selecting", 500);
  }

  // 원본 셀렉션의 이미지를 새 셀렉션으로 복사 (같은 image_id 공유)
  const { data: sourceImages } = await getSupabase()
    .from("selection_images")
    .select("image_id, sort_order")
    .eq("collection_id", finalCollectionId)
    .eq("selection_id", finalSelectionId)
    .order("sort_order", { ascending: true });

  if (sourceImages && sourceImages.length > 0) {
    await getSupabase()
      .from("selection_images")
      .insert(
        sourceImages.map((img) => ({
          collection_id: selecting_collection_id,
          selection_id: newData.selection_id,
          image_id: img.image_id,
          sort_order: img.sort_order,
        }))
      );
  }

  // 컬렉션 커버가 비어있으면 첫 이미지로 자동 설정
  if (sourceImages && sourceImages.length > 0) {
    await ensureCollectionCoverIfEmpty(selecting_collection_id, sourceImages[0].image_id);
  }

  return apiResponse({ success: true }, 201);
}
