import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { ensureCollectionCoverIfEmpty } from "@/lib/collectionCover";
import { recalcCollectionSelectionNum } from "@/lib/collectionStats";
import {
  getSelectionHomeMap,
  isSelectionVisibleToViewer,
} from "@/lib/selectionVisibility";

/**
 * @openapi
 * /selectings:
 *   get:
 *     tags: [Selectings]
 *     summary: 내가 셀렉팅한 목록 조회
 *     description: |
 *       `collection_selections` 테이블에서 내가 다른 유저의 셀렉션을 퍼온(selecting) 목록을 조회합니다.
 *       내가 추가했지만 내가 owner가 아닌 셀렉션만 반환합니다.
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
 *                             id: 789
 *                             collection_id: 636
 *               empty:
 *                 summary: 셀렉팅 없음
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     selectings: []
 *       401:
 *         description: 인증 필요
 *       500:
 *         description: 서버 오류
 *   post:
 *     tags: [Selectings]
 *     summary: 셀렉션 퍼오기 (selecting)
 *     description: |
 *       다른 유저의 셀렉션을 내 컬렉션에 매핑합니다.
 *       셀렉션 데이터를 복사하지 않고 collection_selections에 매핑만 추가합니다.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [selecting_collection_id, selected_selection_id]
 *             properties:
 *               selecting_collection_id:
 *                 type: integer
 *                 description: 퍼올 내 컬렉션 ID
 *               selected_selection_id:
 *                 type: integer
 *                 description: 원본 셀렉션 ID
 *           examples:
 *             ok:
 *               value:
 *                 selecting_collection_id: 200
 *                 selected_selection_id: 789
 *     responses:
 *       201:
 *         description: 셀렉팅 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [errorCode, msg, data]
 *               properties:
 *                 errorCode:
 *                   type: string
 *                   example: SU000
 *                 msg:
 *                   type: string
 *                   example: ok
 *                 data:
 *                   type: object
 *                   required: [success]
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     success: true
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               ownSelection:
 *                 value:
 *                   errorCode: SU000
 *                   msg: You cannot select your own selection
 *                   data: {}
 *       401:
 *         description: 인증 필요
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *       404:
 *         description: 원본 셀렉션을 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               notFound:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Source selection not found
 *                   data: {}
 *       409:
 *         description: 이미 셀렉팅된 셀렉션
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               conflict:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Already selected in this collection
 *                   data: {}
 *       403:
 *         description: 퍼가기 불가 셀렉션
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               notSelectable:
 *                 value:
 *                   errorCode: SU000
 *                   msg: This selection is not selectable
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

  // 내가 추가했지만 내가 owner가 아닌 매핑 = 셀렉팅
  const { data, error } = await getSupabase()
    .from("collection_selections")
    .select(
      `collection_id, selection_id, created_at,
       selections(id, title, owner_id, owner_name,
         selection_images(image_id, sort_order)
       )`
    )
    .eq("user_id", auth.userId)
    .neq("selections.owner_id", auth.userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getSelectings error:", error);
    return apiError("Failed to fetch selectings", 500);
  }

  type CSRow = {
    collection_id: number;
    selection_id: number;
    created_at: string;
    selections: {
      id: number;
      title: string;
      owner_id: number;
      owner_name: string;
      selection_images: { image_id: string; sort_order: number }[];
    } | null;
  };

  // selections가 null인 경우 (neq 필터로 제외된 경우) 필터링
  let rows = ((data ?? []) as unknown as CSRow[]).filter((r) => r.selections !== null);

  // 원본(home) 컬렉션이 비공개면 원작자 외에는 숨김
  if (rows.length > 0) {
    const homeMap = await getSelectionHomeMap(rows.map((r) => r.selection_id));
    rows = rows.filter((r) =>
      isSelectionVisibleToViewer(homeMap.get(r.selection_id), auth.userId)
    );
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

  for (const row of rows) {
    const sel = row.selections!;
    const createdAt = new Date(row.created_at);
    const dateStr = createdAt.toISOString().slice(0, 10);
    const timeStr = createdAt.toTimeString().slice(0, 8);

    const imgs = [...sel.selection_images].sort((a, b) => a.sort_order - b.sort_order);

    const item = {
      created_time: timeStr,
      selection_name: sel.title,
      user_name: userName,
      image_id: imgs[0]?.image_id ?? null,
      owner_name: sel.owner_name,
      owner_id: sel.owner_id,
      id: sel.id,
      collection_id: row.collection_id,
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
// body: { selecting_collection_id, selected_selection_id }
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { selecting_collection_id, selected_selection_id } = body;

  // 원본 셀렉션 존재 확인
  const { data: selectedSelection, error: fetchError } = await getSupabase()
    .from("selections")
    .select("id, is_selectable, owner_id")
    .eq("id", selected_selection_id)
    .single();

  if (fetchError || !selectedSelection) {
    return apiError("Source selection not found", 404);
  }

  if (!selectedSelection.is_selectable) {
    return apiError("This selection is not selectable", 403);
  }

  // 원작자는 본인 셀렉션을 셀렉팅할 수 없다 (home 유일성 보장)
  if (selectedSelection.owner_id === auth.userId) {
    return apiError("You cannot select your own selection", 400);
  }

  // 이미 해당 컬렉션에 매핑되어 있는지 확인
  const { data: existing } = await getSupabase()
    .from("collection_selections")
    .select("selection_id")
    .eq("collection_id", selecting_collection_id)
    .eq("selection_id", selected_selection_id)
    .maybeSingle();

  if (existing) {
    return apiError("Already selected in this collection", 409);
  }

  // collection_selections에 매핑 추가
  const { error: insertError } = await getSupabase()
    .from("collection_selections")
    .insert({
      collection_id: selecting_collection_id,
      selection_id: selected_selection_id,
      user_id: auth.userId,
    });

  if (insertError) {
    console.error("selecting insert error:", insertError);
    return apiError("Failed to create selecting", 500);
  }

  await recalcCollectionSelectionNum(selecting_collection_id);

  // 컬렉션 커버가 비어있으면 셀렉션의 첫 이미지로 자동 설정
  const { data: sourceImages } = await getSupabase()
    .from("selection_images")
    .select("image_id, sort_order")
    .eq("selection_id", selected_selection_id)
    .order("sort_order", { ascending: true })
    .limit(1);

  if (sourceImages && sourceImages.length > 0) {
    await ensureCollectionCoverIfEmpty(selecting_collection_id, sourceImages[0].image_id);
  }

  return apiResponse({ success: true }, 201);
}
