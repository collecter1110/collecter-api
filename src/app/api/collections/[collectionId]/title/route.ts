import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";

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
 *               required: [title]
 *               properties:
 *                 title:
 *                   type: string
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     title: 내 컬렉션
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
  _request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  const { collectionId: idParam } = await params;
  const collectionId = parseInt(idParam, 10);

  if (isNaN(collectionId)) {
    return apiError("Invalid collection ID", 400);
  }

  const { data, error } = await getSupabase()
    .from("collections")
    .select("title")
    .eq("id", collectionId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return apiError("Collection not found", 404);
    }
    console.error("getCollectionTitle error:", error);
    return apiError("Failed to fetch title", 500);
  }

  return apiResponse({ title: data.title });
}
