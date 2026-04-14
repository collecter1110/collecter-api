import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

/**
 * @openapi
 * /selections/{selectionId}:
 *   patch:
 *     tags: [Selections]
 *     summary: 셀렉션 이동
 *     description: 셀렉션을 다른 컬렉션으로 이동합니다.
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *             required: [collectionId]
 *             properties:
 *               collectionId:
 *                 type: integer
 *                 description: 이동할 컬렉션 ID
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
 *         description: collectionId 누락
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: collectionId is required
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
// PATCH /selections/:selectionId — moveSelection
// body: { collectionId: number }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ selectionId: string }> }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { selectionId: sIdParam } = await params;
  const selectionId = parseInt(sIdParam, 10);

  if (isNaN(selectionId)) {
    return apiError("Invalid ID", 400);
  }

  const body = await request.json();
  const { collectionId } = body;

  if (!collectionId) {
    return apiError("collectionId is required", 400);
  }

  const { error } = await getSupabase()
    .from("selections")
    .update({
      collection_id: collectionId,
    })
    .eq("selection_id", selectionId);

  if (error) {
    console.error("moveSelection error:", error);
    return apiError("Failed to move selection", 500);
  }

  return apiResponse({ success: true });
}
