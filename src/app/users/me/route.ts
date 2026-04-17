import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { uploadImageAndSave, deleteImageById } from "@/lib/storage";

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
 *                       selecting_count: 12
 *                       selected_count: 5
 *                       like_count: 30
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

  const [userResult, selectingResult, selectedResult, likeResult] = await Promise.all([
    getSupabase()
      .from("userinfo")
      .select("user_id, name, email, description, image_id")
      .eq("user_id", auth.userId)
      .single(),
    // 내가 셀렉팅한 수: 내가 추가했지만 내가 owner가 아닌 매핑
    getSupabase()
      .from("collection_selections")
      .select("selection_id, selections_v2!inner(owner_id)", { count: "exact", head: true })
      .eq("user_id", auth.userId)
      .neq("selections_v2.owner_id", auth.userId),
    // 셀렉팅 당한 수: 내가 owner인 셀렉션을 다른 유저가 매핑
    getSupabase()
      .from("collection_selections")
      .select("selection_id, selections_v2!inner(owner_id)", { count: "exact", head: true })
      .eq("selections_v2.owner_id", auth.userId)
      .neq("user_id", auth.userId),
    getSupabase()
      .from("likes")
      .select("*", { count: "exact", head: true })
      .eq("user_id", auth.userId),
  ]);

  if (userResult.error) {
    console.error("getUserInfo error:", userResult.error);
    return apiError("Failed to fetch user", 500);
  }

  const { name, ...rest } = userResult.data;
  return apiResponse({
    user: {
      ...rest,
      user_name: name,
      selecting_count: selectingResult.count ?? 0,
      selected_count: selectedResult.count ?? 0,
      like_count: likeResult.count ?? 0,
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
    description: description ?? null,
  };

  if (imageFile && imageFile.size > 0) {
    const { data: old } = await getSupabase()
      .from("userinfo")
      .select("image_id")
      .eq("user_id", auth.userId)
      .single();

    if (old?.image_id) {
      await deleteImageById(old.image_id);
    }

    try {
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      const { imageId } = await uploadImageAndSave(
        buffer,
        imageFile.type
      );
      updates.image_id = imageId;
    } catch {
      return apiError("Failed to upload image", 500);
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
