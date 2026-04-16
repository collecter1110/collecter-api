import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

/**
 * @openapi
 * /collections/{collectionId}/selections/{selectionId}/move:
 *   patch:
 *     tags: [Selections]
 *     summary: 셀렉션 이동
 *     description: 셀렉션을 다른 컬렉션으로 이동합니다.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 123
 *       - in: path
 *         name: selectionId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 456
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [target_collection_id]
 *             properties:
 *               target_collection_id:
 *                 type: integer
 *                 description: 이동할 대상 컬렉션 ID
 *                 example: 200
 *     responses:
 *       200:
 *         description: 이동 성공
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
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 필요
 *       404:
 *         description: 셀렉션을 찾을 수 없음
 *       500:
 *         description: 이동 실패
 */

type Params = { params: Promise<{ collectionId: string; selectionId: string }> };

// PATCH /collections/:collectionId/selections/:selectionId/move
// body: { target_collection_id: number }
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { collectionId: cIdParam, selectionId: sIdParam } = await params;
  const collectionId = parseInt(cIdParam, 10);
  const selectionId = parseInt(sIdParam, 10);

  if (isNaN(collectionId) || isNaN(selectionId)) {
    return apiError("Invalid ID", 400);
  }

  const body = await request.json();
  const { target_collection_id } = body;

  if (target_collection_id == null) {
    return apiError("target_collection_id is required", 400);
  }

  // 기존 셀렉션 데이터 조회
  const { data: original, error: fetchError } = await getSupabase()
    .from("selections")
    .select("*")
    .eq("collection_id", collectionId)
    .eq("selection_id", selectionId)
    .single();

  if (fetchError || !original) {
    return apiError("Selection not found", 404);
  }

  // 대상 컬렉션의 다음 selection_id 계산
  const { data: maxRow } = await getSupabase()
    .from("selections")
    .select("selection_id")
    .eq("collection_id", target_collection_id)
    .order("selection_id", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSelectionId = (maxRow?.selection_id ?? 0) + 1;

  // 대상 컬렉션에 새 selection_id로 insert
  const { collection_id: _old, selection_id: _oldSid, ...rest } = original;
  const { data: inserted, error: insertError } = await getSupabase()
    .from("selections")
    .insert({
      ...rest,
      collection_id: target_collection_id,
      selection_id: nextSelectionId,
    })
    .select("collection_id, selection_id")
    .single();

  if (insertError || !inserted) {
    console.error("moveSelection insert error:", insertError);
    return apiError("Failed to move selection", 500);
  }

  // 이미지 레코드 이동
  const { data: images } = await getSupabase()
    .from("selection_images")
    .select("*")
    .eq("collection_id", collectionId)
    .eq("selection_id", selectionId);

  if (images && images.length > 0) {
    for (const img of images) {
      await getSupabase().from("selection_images").insert({
        collection_id: inserted.collection_id,
        selection_id: inserted.selection_id,
        image_id: img.image_id,
        sort_order: img.sort_order,
      });
    }

    // 기존 이미지 레코드 삭제
    await getSupabase()
      .from("selection_images")
      .delete()
      .eq("collection_id", collectionId)
      .eq("selection_id", selectionId);
  }

  // 기존 셀렉션 삭제
  const { error: deleteError } = await getSupabase()
    .from("selections")
    .delete()
    .eq("collection_id", collectionId)
    .eq("selection_id", selectionId);

  if (deleteError) {
    console.error("moveSelection delete error:", deleteError);
    return apiError("Failed to move selection", 500);
  }

  return apiResponse({ success: true });
}
