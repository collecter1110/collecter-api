import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

/**
 * @openapi
 * /api/keywords:
 *   post:
 *     tags: [Keywords]
 *     summary: 키워드 추가
 *     description: 카테고리에 키워드를 추가하고 `keyword_id`를 반환합니다. 이미 존재하는 키워드는 중복 추가되지 않습니다.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [keywords, category_id]
 *             properties:
 *               keywords:
 *                 type: array
 *                 items:
 *                   type: string
 *               category_id:
 *                 type: integer
 *           examples:
 *             ok:
 *               value:
 *                 keywords: ["키워드1", "키워드2"]
 *                 category_id: 1
 *     responses:
 *       200:
 *         description: 키워드 목록 (ID 포함)
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
 *                     properties:
 *                       keyword_name:
 *                         type: string
 *                       keyword_id:
 *                         type: integer
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     keywords:
 *                       - keyword_name: 키워드1
 *                         keyword_id: 7
 *                       - keyword_name: 키워드2
 *                         keyword_id: 8
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: keywords array and category_id are required
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
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to fetch keywords
 *                   data: {}
 */
// POST /api/keywords — addKeywords
// body: { keywords: string[], category_id: number }
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { keywords, category_id } = body;

  if (!keywords || !Array.isArray(keywords) || !category_id) {
    return apiError("keywords array and category_id are required", 400);
  }

  const entries = keywords.map((keyword: string) => ({
    keyword_name: keyword,
    category_id,
  }));

  await getSupabase().from("keywordinfo").insert(entries);

  const { data, error } = await getSupabase()
    .from("keywordinfo")
    .select("keyword_name, keyword_id")
    .eq("category_id", category_id)
    .in("keyword_name", keywords);

  if (error) {
    console.error("addKeywords error:", error);
    return apiError("Failed to fetch keywords", 500);
  }

  return apiResponse({ keywords: data });
}
