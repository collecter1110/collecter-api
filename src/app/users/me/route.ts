import { NextRequest, NextResponse, after } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { uploadImageAndSave, deleteImageById } from "@/lib/storage";
import { PROFILE_IMAGE_PRESET, isRejectableImageError } from "@/lib/image";
import { emptyToNull } from "@/lib/formData";

/**
 * @openapi
 * /users/me:
 *   get:
 *     tags: [Users]
 *     summary: 내 정보 조회
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 내 유저 정보
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [user]
 *               properties:
 *                 user:
 *                   $ref: "#/components/schemas/MyUserInfo"
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     user:
 *                       user_id: 45
 *                       user_name: gimgahui
 *                       email: user@example.com
 *                       description: 안녕하세요
 *                       image_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                       push_enabled: true
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
 *                   msg: Failed to fetch user
 *                   data: {}
 *   patch:
 *     tags: [Users]
 *     summary: 내 정보 수정
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [user_name]
 *             properties:
 *               user_name:
 *                 type: string
 *               description:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: 수정 성공
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
 *         description: name 누락
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: user_name is required
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
 *         description: 수정 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to update user
 *                   data: {}
 */
// GET /users/me — getUserInfo
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const userResult = await getSupabase()
    .from("userinfo")
    .select("user_id, name, email, description, image_id, push_enabled")
    .eq("user_id", auth.userId)
    .single();

  if (userResult.error) {
    console.error("getUserInfo error:", userResult.error);
    return apiError("Failed to fetch user", 500);
  }

  const { name, ...rest } = userResult.data;
  return apiResponse({
    user: {
      ...rest,
      user_name: name,
    },
  });
}

// PATCH /users/me — editUserInfo
// body: multipart/form-data { name, description?, image? }
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const formData = await request.formData();
  const user_name = formData.get("user_name") as string | null;
  const description = formData.get("description") as string | null;
  const imageFile = formData.get("image") as File | null;

  if (!user_name) {
    return apiError("user_name is required", 400);
  }

  const updates: Record<string, unknown> = {
    name: user_name,
    description: emptyToNull(description),
  };

  if (imageFile && imageFile.size > 0) {
    const { data: old } = await getSupabase()
      .from("userinfo")
      .select("image_id")
      .eq("user_id", auth.userId)
      .single();

    try {
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      const { imageId } = await uploadImageAndSave(
        buffer,
        PROFILE_IMAGE_PRESET
      );
      updates.image_id = imageId;
    } catch (err) {
      if (isRejectableImageError(err)) {
        // 기존 앱 업로드가 새 제한에 걸리는지 배포 후 확인할 수 있도록 사유를 남긴다.
        console.warn("profile image rejected:", (err as Error).message);
        return apiError("Unsupported, corrupted, or oversized image file", 400);
      }
      console.error("editUserInfo image upload error:", err);
      return apiError("Failed to upload image", 500);
    }

    // 기존 이미지 삭제(S3 + images)는 응답에 영향이 없는 후처리이므로 응답 후 실행
    if (old?.image_id) {
      const oldImageId = old.image_id as string;
      after(async () => {
        try {
          await deleteImageById(oldImageId);
        } catch (err) {
          console.error("editUserInfo old image delete error:", err);
        }
      });
    }
  }

  const { error } = await getSupabase()
    .from("userinfo")
    .update(updates)
    .eq("user_id", auth.userId);

  if (error) {
    console.error("editUserInfo error:", error);
    return apiError("Failed to update user", 500);
  }

  return apiResponse({ success: true });
}
