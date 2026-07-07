import { NextRequest, NextResponse, after } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { deleteImageById } from "@/lib/storage";

/**
 * @openapi
 * /membership:
 *   delete:
 *     tags: [Auth]
 *     summary: 회원 탈퇴 (Soft Delete)
 *     description: |
 *       유저 계정을 soft delete 처리합니다. `userinfo.deleted_at`을 설정하고 모든 세션을 폐기합니다.
 *       컬렉션/셀렉션 데이터는 유지됩니다. 계정 완전 삭제는 `/auth/delete`를 사용하세요.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 회원 탈퇴 성공
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
 *         description: 탈퇴 처리 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to cancel membership
 *                   data: {}
 */
// DELETE /membership — cancelMembership
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  // 프로필 이미지 삭제
  const { data: user } = await getSupabase()
    .from("userinfo")
    .select("image_id")
    .eq("user_id", auth.userId)
    .single();

  // Soft delete: keep collections/selections, but make user unresolvable by user_id.
  // Also revoke refresh sessions so tokens can't be refreshed.
  await getSupabase()
    .from("auth_refresh_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", auth.userId)
    .is("revoked_at", null);

  const { error } = await getSupabase()
    .from("userinfo")
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", auth.userId)
    .is("deleted_at", null);

  // 프로필 이미지 삭제(S3 + images)는 응답에 영향이 없는 후처리이므로 응답 후 실행
  if (user?.image_id) {
    const imageId = user.image_id as string;
    after(async () => {
      try {
        await deleteImageById(imageId);
      } catch (err) {
        console.error("cancelMembership image delete error:", err);
      }
    });
  }

  if (error) {
    console.error("cancelMembership soft-delete error:", error);
    return apiError("Failed to cancel membership", 500);
  }

  return apiResponse({ success: true });
}
