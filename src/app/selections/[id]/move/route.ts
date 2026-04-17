import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { recalcCollectionSelectionNums } from "@/lib/collectionStats";

/**
 * @openapi
 * /selections/{id}/move:
 *   patch:
 *     tags: [Selections]
 *     summary: 셀렉션 이동
 *     description: 셀렉션을 다른 컬렉션으로 이동합니다. (collection_selections 매핑 변경)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 789
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [source_collection_id, target_collection_id]
 *             properties:
 *               source_collection_id:
 *                 type: integer
 *                 description: 현재 컬렉션 ID
 *                 example: 100
 *               target_collection_id:
 *                 type: integer
 *                 description: 이동할 대상 컬렉션 ID
 *                 example: 200
 *     responses:
 *       200:
 *         description: 이동 성공
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 필요
 *       404:
 *         description: 셀렉션을 찾을 수 없음
 *       500:
 *         description: 이동 실패
 */

type Params = { params: Promise<{ id: string }> };

// PATCH /selections/:id/move
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { id: idParam } = await params;
  const id = parseInt(idParam, 10);

  if (isNaN(id)) {
    return apiError("Invalid ID", 400);
  }

  const body = await request.json();
  const { source_collection_id, target_collection_id } = body;

  if (source_collection_id == null || target_collection_id == null) {
    return apiError("source_collection_id and target_collection_id are required", 400);
  }

  // 매핑 존재 확인
  const { data: mapping, error: fetchError } = await getSupabase()
    .from("collection_selections")
    .select("collection_id, selection_id")
    .eq("collection_id", source_collection_id)
    .eq("selection_id", id)
    .maybeSingle();

  if (fetchError || !mapping) {
    return apiError("Selection not found in source collection", 404);
  }

  // 기존 매핑 삭제 → 새 매핑 삽입
  const { error: deleteError } = await getSupabase()
    .from("collection_selections")
    .delete()
    .eq("collection_id", source_collection_id)
    .eq("selection_id", id);

  if (deleteError) {
    console.error("moveSelection delete error:", deleteError);
    return apiError("Failed to move selection", 500);
  }

  const { error: insertError } = await getSupabase()
    .from("collection_selections")
    .insert({
      collection_id: target_collection_id,
      selection_id: id,
      user_id: auth.userId,
    });

  if (insertError) {
    console.error("moveSelection insert error:", insertError);
    return apiError("Failed to move selection", 500);
  }

  await recalcCollectionSelectionNums([source_collection_id, target_collection_id]);

  return apiResponse({ success: true });
}
