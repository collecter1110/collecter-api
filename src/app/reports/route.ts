import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

/**
 * @openapi
 * /reports:
 *   post:
 *     tags: [Reports]
 *     summary: 신고 접수
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [report_type, reported_post_id, report_reason]
 *             properties:
 *               report_type:
 *                 type: integer
 *                 description: 신고 유형 코드
 *               reported_post_id:
 *                 type: object
 *                 description: "신고 대상 ID (예: { collection_id: 123, selection_id: 456 })"
 *               report_reason:
 *                 type: string
 *                 description: 신고 사유
 *           examples:
 *             collection:
 *               summary: 컬렉션 신고
 *               value:
 *                 report_type: 1
 *                 reported_post_id:
 *                   collection_id: 123
 *                 report_reason: 부적절한 콘텐츠
 *             selection:
 *               summary: 셀렉션 신고
 *               value:
 *                 report_type: 2
 *                 reported_post_id:
 *                   collection_id: 123
 *                   selection_id: 456
 *                 report_reason: 스팸
 *     responses:
 *       201:
 *         description: 신고 접수 성공
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
 *         description: 필수 필드 누락
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: report_type, reported_post_id, report_reason are required
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
 *         description: 신고 접수 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to submit report
 *                   data: {}
 */
// POST /reports — report
// body: { report_type: number, reported_post_id: { [key: string]: number }, report_reason: string }
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { report_type, reported_post_id, report_reason } = body;

  if (!report_type || !reported_post_id || !report_reason) {
    return apiError("report_type, reported_post_id, report_reason are required", 400);
  }

  const { error } = await getSupabase().from("reports").insert({
    report_type,
    report_reason,
    reporter_user_id: auth.userId,
    reported_post_id,
  });

  if (error) {
    console.error("report error:", error);
    return apiError("Failed to submit report", 500);
  }

  return apiResponse({ success: true }, 201);
}
