import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

const PLATFORMS = ["ios", "android"] as const;

async function readBody(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) ?? {};
  } catch {
    return {};
  }
}

/**
 * @openapi
 * /users/fcm-token:
 *   post:
 *     tags: [Users]
 *     summary: FCM 기기 토큰 등록/갱신
 *     description: |
 *       멱등합니다. 로그인 직후 1회, 이후 앱 진입마다, 그리고 FCM `onTokenRefresh`로
 *       토큰이 바뀔 때마다 같은 호출을 쓰면 됩니다. upsert라서 신규 등록과 갱신을
 *       모두 처리합니다.
 *
 *       `fcm_token`이 이미 다른 유저에게 등록돼 있으면 새 행을 만들지 않고 해당 행의
 *       소유자를 호출한 유저로 옮깁니다. 한 기기에서 A가 로그아웃하고 B가 로그인하면
 *       FCM이 같은 토큰을 다시 내주기 때문에, 이렇게 하지 않으면 A에게 갈 알림이
 *       B의 기기로 발송됩니다.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fcm_token, platform]
 *             properties:
 *               fcm_token:
 *                 type: string
 *               platform:
 *                 type: string
 *                 enum: [ios, android]
 *           examples:
 *             ok:
 *               value:
 *                 fcm_token: "fZx1...token"
 *                 platform: ios
 *     responses:
 *       200:
 *         description: 등록 성공
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
 *         description: fcm_token 누락 또는 platform 값 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: platform must be one of ios, android
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
 *         description: 등록 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to register fcm token
 *                   data: {}
 *   delete:
 *     tags: [Users]
 *     summary: FCM 기기 토큰 삭제
 *     description: 로그아웃/탈퇴 시 호출합니다. 등록된 토큰이 없어도 성공으로 응답합니다.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fcm_token]
 *             properties:
 *               fcm_token:
 *                 type: string
 *           examples:
 *             ok:
 *               value:
 *                 fcm_token: "fZx1...token"
 *     responses:
 *       200:
 *         description: 삭제 성공
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
 *         description: fcm_token 누락
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: fcm_token is required
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
 *         description: 삭제 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to delete fcm token
 *                   data: {}
 */
// POST /users/fcm-token — registerFcmToken
// body: { fcm_token: string, platform: "ios" | "android" }
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await readBody(request);
  const fcmToken = typeof body.fcm_token === "string" ? body.fcm_token.trim() : "";
  const platform = typeof body.platform === "string" ? body.platform : "";

  if (!fcmToken) {
    return apiError("fcm_token is required", 400);
  }
  if (!PLATFORMS.includes(platform as (typeof PLATFORMS)[number])) {
    return apiError(`platform must be one of ${PLATFORMS.join(", ")}`, 400);
  }

  // Conflict target is fcm_token alone, so a handset reused by a second
  // account moves to that account rather than gaining a duplicate row.
  const { error } = await getSupabase().from("fcm_tokens").upsert(
    {
      user_id: auth.userId,
      fcm_token: fcmToken,
      platform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "fcm_token" }
  );

  if (error) {
    console.error("registerFcmToken error:", error);
    return apiError("Failed to register fcm token", 500);
  }

  return apiResponse({ success: true });
}

// DELETE /users/fcm-token — deleteFcmToken
// body: { fcm_token: string }
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await readBody(request);
  const fcmToken = typeof body.fcm_token === "string" ? body.fcm_token.trim() : "";

  if (!fcmToken) {
    return apiError("fcm_token is required", 400);
  }

  // Scoped to the caller: a token already reassigned to another account is
  // that account's to keep, and must not be deleted out from under them.
  const { error } = await getSupabase()
    .from("fcm_tokens")
    .delete()
    .eq("fcm_token", fcmToken)
    .eq("user_id", auth.userId);

  if (error) {
    console.error("deleteFcmToken error:", error);
    return apiError("Failed to delete fcm token", 500);
  }

  return apiResponse({ success: true });
}
