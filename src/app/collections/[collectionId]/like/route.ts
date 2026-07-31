import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

/**
 * @openapi
 * /collections/{collectionId}/like:
 *   post:
 *     tags: [Collections]
 *     summary: 컬렉션 좋아요
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 123
 *     responses:
 *       200:
 *         description: 좋아요 성공
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
 *       500:
 *         description: 좋아요 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to like
 *                   data: {}
 *   delete:
 *     tags: [Collections]
 *     summary: 컬렉션 좋아요 취소
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 123
 *     responses:
 *       200:
 *         description: 좋아요 취소 성공
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
 *       500:
 *         description: 좋아요 취소 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to unlike
 *                   data: {}
 */

type Params = { params: Promise<{ collectionId: string }> };

// POST /collections/:collectionId/like — actionLike
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { collectionId: idParam } = await params;
  const collectionId = parseInt(idParam, 10);

  if (isNaN(collectionId)) {
    return apiError("Invalid collection ID", 400);
  }

  // 멱등: 이미 좋아요한 상태에서 다시 눌러도 성공으로 처리한다.
  // 유니크 제약(unique_like) 위반을 500 으로 돌려주면, 클라이언트가 하트를
  // 되돌려 DB 상태와 화면이 어긋난다. ON CONFLICT DO NOTHING 이라 insert 가
  // 일어나지 않고 update_like_num 트리거도 돌지 않으므로 like_num 도 안전하다.
  const { error } = await getSupabase()
    .from("likes")
    .upsert(
      { user_id: auth.userId, collection_id: collectionId },
      { onConflict: "user_id,collection_id", ignoreDuplicates: true }
    );

  if (error) {
    console.error("actionLike error:", error);
    return apiError("Failed to like", 500);
  }

  return apiResponse({ success: true });
}

// DELETE /collections/:collectionId/like — actionUnlike
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { collectionId: idParam } = await params;
  const collectionId = parseInt(idParam, 10);

  if (isNaN(collectionId)) {
    return apiError("Invalid collection ID", 400);
  }

  const { error } = await getSupabase()
    .from("likes")
    .delete()
    .eq("user_id", auth.userId)
    .eq("collection_id", collectionId);

  if (error) {
    console.error("actionUnlike error:", error);
    return apiError("Failed to unlike", 500);
  }

  return apiResponse({ success: true });
}
