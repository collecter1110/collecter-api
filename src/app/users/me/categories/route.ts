import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

/**
 * @openapi
 * /users/me/categories:
 *   get:
 *     tags: [Users]
 *     summary: 내 관심 카테고리 랭킹
 *     description: |
 *       로그인한 유저가 생성한 컬렉션의 카테고리별 사용 횟수를 내림차순으로 반환합니다.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 카테고리 랭킹
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [categories]
 *               properties:
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: object
 *                     required: [category_id, count]
 *                     properties:
 *                       category_id:
 *                         type: integer
 *                       count:
 *                         type: integer
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     categories:
 *                       - category_id: 1
 *                         count: 5
 *                       - category_id: 6
 *                         count: 4
 *                       - category_id: 4
 *                         count: 2
 *                       - category_id: 3
 *                         count: 1
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
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 */
// GET /users/me/categories — getMyCategoryRanking
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await getSupabase()
    .from("collections")
    .select("category_id")
    .eq("user_id", auth.userId);

  if (error) {
    console.error("getMyCategoryRanking error:", error);
    return apiError("Failed to fetch categories", 500);
  }

  const counts = new Map<number, number>();
  for (const row of (data ?? []) as { category_id: number | null }[]) {
    if (row.category_id == null) continue;
    counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1);
  }

  const categories = Array.from(counts.entries())
    .map(([category_id, count]) => ({ category_id, count }))
    .sort((a, b) => b.count - a.count);

  return apiResponse({ categories });
}
