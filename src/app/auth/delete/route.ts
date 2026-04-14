import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

/**
 * @openapi
 * /auth/delete:
 *   delete:
 *     tags: [Auth]
 *     summary: 계정 삭제 (Hard Delete)
 *     description: |
 *       유저 계정을 완전 삭제합니다. 모든 세션을 폐기하고 `userinfo` 행을 삭제합니다.
 *       회원 탈퇴(soft delete)는 `/membership` DELETE를 사용하세요.
 *     security:
 *       - bearerAuth: []
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
 *       401:
 *         description: 인증 실패
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
 *                   msg: Failed to delete user
 *                   data: {}
 */
// DELETE /auth/delete
// deleteAuthUser (Local Auth): delete by user_id/email (and revoke sessions)
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  // Revoke refresh sessions
  await getSupabase()
    .from("auth_refresh_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", auth.userId)
    .is("revoked_at", null);

  // Delete userinfo row (and rely on DB constraints/cascades if configured)
  const { error } = await getSupabase()
    .from("userinfo")
    .delete()
    .eq("user_id", auth.userId);

  if (error) {
    console.error("deleteAuthUser error:", error);
    return apiError("Failed to delete user", 500);
  }

  return apiResponse({ success: true });
}
