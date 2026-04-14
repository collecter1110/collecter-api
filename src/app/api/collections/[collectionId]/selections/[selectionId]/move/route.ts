import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

/**
 * @openapi
 * /api/collections/{collectionId}/selections/{selectionId}/move:
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
 *             required: [new_collection_id, category_id]
 *             properties:
 *               new_collection_id:
 *                 type: integer
 *                 description: 이동할 컬렉션 ID
 *               category_id:
 *                 type: integer
 *                 description: 이동할 컬렉션의 카테고리 ID
 *           examples:
 *             ok:
 *               value:
 *                 new_collection_id: 200
 *                 category_id: 2
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
 *         description: new_collection_id 누락
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: new_collection_id is required
 *                   data: {}
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
 *       500:
 *         description: 이동 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to move selection
 *                   data: {}
 */
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
    return apiError("Invalid ID", 400);
  }

  const body = await request.json();
  const { category_id, new_collection_id } = body;

  if (!new_collection_id) {
    return apiError("new_collection_id is required", 400);
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
    return apiError("Failed to move selection", 500);
  }

  return apiResponse({ success: true });
}
