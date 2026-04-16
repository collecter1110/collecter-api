import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";

/**
 * @openapi
 * /auth/check-email:
 *   get:
 *     tags: [Auth]
 *     summary: 이메일 중복 확인
 *     description: "이메일이 사용 가능한지 확인합니다. (success=true이면 사용 가능, success=false이면 이미 존재)"
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 *         example: user@example.com
 *     responses:
 *       200:
 *         description: 중복 확인 결과
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success]
 *               properties:
 *                 success:
 *                   type: boolean
 *             examples:
 *               available:
 *                 summary: 사용 가능한 이메일
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     success: true
 *               taken:
 *                 summary: 이미 사용 중인 이메일
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     success: false
 *       400:
 *         description: email 파라미터 누락
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: email parameter is required
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
 *                   msg: Server error
 *                   data: {}
 */
// GET /auth/check-email?email=...
// success: true = 사용 가능, false = 이미 존재
export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email");

  if (!email) {
    return apiError("email parameter is required", 400);
  }

  const { data, error } = await getSupabase()
    .from("userinfo")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    console.error("checkEmailDuplicate error:", error);
    return apiError("Server error", 500);
  }

  return apiResponse({ success: data === null });
}
