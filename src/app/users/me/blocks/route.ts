import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

/**
 * @openapi
 * /users/me/blocks:
 *   get:
 *     tags: [Users]
 *     summary: 차단한 유저 ID 목록 조회
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 차단한 유저 ID 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [blocked_user_ids]
 *               properties:
 *                 blocked_user_ids:
 *                   type: array
 *                   items:
 *                     type: integer
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     blocked_user_ids: [12, 34, 56]
 *               empty:
 *                 summary: 차단한 유저 없음
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     blocked_user_ids: []
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
 *                   msg: Failed to fetch blocked users
 *                   data: {}
 *   post:
 *     tags: [Users]
 *     summary: 유저 차단
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [blocked_user_id]
 *             properties:
 *               blocked_user_id:
 *                 type: integer
 *           examples:
 *             ok:
 *               value:
 *                 blocked_user_id: 99
 *     responses:
 *       200:
 *         description: 차단 성공
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
 *         description: blocked_user_id 누락
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: blocked_user_id is required
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
 *         description: 차단 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to block user
 *                   data: {}
 */
// GET /users/me/blocks — initializeBlockedIds
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await getSupabase()
    .from("block")
    .select("blocked_user_id")
    .eq("blocker_user_id", auth.userId);

  if (error) {
    console.error("initializeBlockedIds error:", error);
    return apiError("Failed to fetch blocked users", 500);
  }

  const blockedUserIds = (data ?? []).map((item) => item.blocked_user_id);

  return apiResponse({ blocked_user_ids: blockedUserIds });
}

// POST /users/me/blocks — block(blockedUserId)
// body: { blocked_user_id: number }
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { blocked_user_id } = body;

  if (!blocked_user_id) {
    return apiError("blocked_user_id is required", 400);
  }

  const { error } = await getSupabase().from("block").insert({
    blocker_user_id: auth.userId,
    blocked_user_id,
  });

  if (error) {
    console.error("block error:", error);
    return apiError("Failed to block user", 500);
  }

  return apiResponse({ success: true });
}
