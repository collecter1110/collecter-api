import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

/**
 * @openapi
 * /users/me/keywords:
 *   get:
 *     tags: [Users]
 *     summary: 내 키워드 랭킹
 *     description: |
 *       로그인한 유저가 셀렉션에 입력한 모든 키워드를 빈도 집계하여 내림차순으로 반환합니다.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 키워드 랭킹
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [keywords]
 *               properties:
 *                 keywords:
 *                   type: array
 *                   items:
 *                     type: object
 *                     required: [keyword, count]
 *                     properties:
 *                       keyword:
 *                         type: string
 *                       count:
 *                         type: integer
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     keywords:
 *                       - keyword: 감성카페
 *                         count: 18
 *                       - keyword: 디저트
 *                         count: 9
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
// GET /users/me/keywords — getMyKeywordRanking
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await getSupabase()
    .from("selections")
    .select("keywords")
    .eq("owner_id", auth.userId);

  if (error) {
    console.error("getMyKeywordRanking error:", error);
    return apiError("Failed to fetch keywords", 500);
  }

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { keywords: unknown }[]) {
    if (!Array.isArray(row.keywords)) continue;
    for (const k of row.keywords) {
      const name =
        k && typeof k === "object" && typeof (k as { keyword_name?: unknown }).keyword_name === "string"
          ? (k as { keyword_name: string }).keyword_name.trim()
          : "";
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  const keywords = Array.from(counts.entries())
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count);

  return apiResponse({ keywords });
}
