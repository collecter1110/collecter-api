import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";

/**
 * @openapi
 * /api/collections/{collectionId}/title:
 *   get:
 *     tags: [Collections]
 *     summary: 컬렉션 제목 조회
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 123
 *     responses:
 *       200:
 *         description: 컬렉션 제목
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [collection_title]
 *               properties:
 *                 collection_title:
 *                   type: string
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     collection_title: 내 컬렉션
 *       404:
 *         description: 컬렉션을 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Collection not found
 *                   data: {}
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to fetch title
 *                   data: {}
 */
// GET /api/collections/:collectionId/title — getCollectionTitle
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  const { collectionId: idParam } = await params;
  const collectionId = parseInt(idParam, 10);

  if (isNaN(collectionId)) {
    return apiError("Invalid collection ID", 400);
  }

  const { data, error } = await getSupabase()
    .from("collections")
    .select("title, user_id, is_public")
    .eq("id", collectionId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return apiError("Collection not found", 404);
    }
    console.error("getCollectionTitle error:", error);
    return apiError("Failed to fetch title", 500);
  }

  const auth = await getAuthContext(request);

  if (!data.is_public && auth?.userId !== data.user_id) {
    return apiError("Collection not found", 404);
  }

  if (auth && auth.userId !== data.user_id) {
    const blockedIds = await getBlockedUserIds(auth.userId);
    if (blockedIds.includes(data.user_id as number)) {
      return apiError("Collection not found", 404);
    }
  }

  return apiResponse({ collection_title: data.title });
}
