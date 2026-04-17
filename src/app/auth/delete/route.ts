import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { deleteImageById } from "@/lib/storage";

/**
 * @openapi
 * /auth/delete:
 *   delete:
 *     tags: [Auth]
 *     summary: 계정 삭제 (Hard Delete, 개발자용)
 *     description: |
 *       유저와 관련된 모든 데이터를 완전 삭제합니다.
 *       - 유저가 owner인 셀렉션의 이미지 (S3 + `images` 테이블)
 *       - 유저 컬렉션의 대표 이미지 (S3 + `images`)
 *       - 유저 프로필 이미지 (S3 + `images`)
 *       - `auth_refresh_sessions`, `auth_otp` 정리
 *       - `userinfo` 삭제 → CASCADE로 `collections`, `selections`, `collection_selections`, `likes`, `block` 등 정리
 *
 *       일반 회원 탈퇴(soft delete)는 `/membership` DELETE를 사용하세요.
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
// deleteAuthUser (Local Auth, Hard Delete)
// - 유저가 owner인 셀렉션의 이미지 (S3 + images)
// - 유저 컬렉션의 대표 이미지 (S3 + images)
// - 유저 프로필 이미지 (S3 + images)
// - auth_refresh_sessions / auth_otp
// - userinfo 본체 (CASCADE로 collections / selections / collection_selections / likes / block 등 정리)
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabase();
  const userId = auth.userId;

  // 1) 이 유저가 owner인 모든 셀렉션의 이미지 ID 수집
  const { data: ownedSelections } = await supabase
    .from("selections")
    .select("id")
    .eq("owner_id", userId);

  const ownedSelectionIds = (ownedSelections ?? []).map((s) => s.id as number);

  const selectionImageIds: string[] = [];
  if (ownedSelectionIds.length > 0) {
    const { data: selImgs } = await supabase
      .from("selection_images")
      .select("image_id")
      .in("selection_id", ownedSelectionIds);
    for (const row of selImgs ?? []) {
      selectionImageIds.push(row.image_id as string);
    }
  }

  // 2) 이 유저의 컬렉션 대표 이미지 ID 수집
  const { data: ownedCollections } = await supabase
    .from("collections")
    .select("image_id")
    .eq("user_id", userId);

  const collectionImageIds = (ownedCollections ?? [])
    .map((c) => c.image_id as string | null)
    .filter((id): id is string => !!id);

  // 3) 프로필 이미지
  const { data: profile } = await supabase
    .from("userinfo")
    .select("image_id, email")
    .eq("user_id", userId)
    .single();

  const profileImageId = (profile?.image_id as string | null) ?? null;
  const userEmail = profile?.email as string | undefined;

  // 4) S3 + images 삭제 (중복 제거)
  const allImageIds = Array.from(
    new Set<string>([
      ...selectionImageIds,
      ...collectionImageIds,
      ...(profileImageId ? [profileImageId] : []),
    ])
  );

  for (const imageId of allImageIds) {
    try {
      await deleteImageById(imageId);
    } catch (err) {
      console.error("deleteAuthUser image delete error:", imageId, err);
    }
  }

  // 5) 세션 / OTP 정리
  await supabase
    .from("auth_refresh_sessions")
    .delete()
    .eq("user_id", userId);

  if (userEmail) {
    await supabase
      .from("auth_otp")
      .delete()
      .eq("email", userEmail);
  }

  // 6) userinfo DELETE → CASCADE로 나머지 연관 테이블(collections / selections /
  //    collection_selections / likes / block 등) 정리
  const { error } = await supabase
    .from("userinfo")
    .delete()
    .eq("user_id", userId);

  if (error) {
    console.error("deleteAuthUser error:", error);
    return apiError("Failed to delete user", 500);
  }

  return apiResponse({ success: true });
}
