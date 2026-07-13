import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

/**
 * @openapi
 * /users/alarm:
 *   patch:
 *     tags: [Users]
 *     summary: 알림 수신 설정 변경
 *     description: |
 *       앱 내 알림 토글입니다. OS 알림 권한과는 별개입니다 — iOS에서 권한을 거부하면
 *       FCM 토큰 자체가 발급되지 않아 어차피 발송되지 않습니다. 이 값은 권한은 허용했지만
 *       앱 설정에서 알림을 끈 유저를 위한 것입니다.
 *
 *       현재 값은 `GET /users/me` 응답의 `push_enabled`로 조회합니다.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [push_enabled]
 *             properties:
 *               push_enabled:
 *                 type: boolean
 *           examples:
 *             off:
 *               summary: 알림 거부
 *               value:
 *                 push_enabled: false
 *             on:
 *               summary: 알림 허용
 *               value:
 *                 push_enabled: true
 *     responses:
 *       200:
 *         description: 설정 변경 성공
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
 *         description: push_enabled 누락 또는 boolean 아님
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: push_enabled must be a boolean
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
 *         description: 설정 변경 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to update alarm setting
 *                   data: {}
 */
// PATCH /users/alarm — updateAlarmSetting
// body: { push_enabled: boolean }
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => ({}));
  const pushEnabled = body?.push_enabled;

  if (typeof pushEnabled !== "boolean") {
    return apiError("push_enabled must be a boolean", 400);
  }

  const { error } = await getSupabase()
    .from("userinfo")
    .update({ push_enabled: pushEnabled })
    .eq("user_id", auth.userId);

  if (error) {
    console.error("updateAlarmSetting error:", error);
    return apiError("Failed to update alarm setting", 500);
  }

  return apiResponse({ success: true });
}
