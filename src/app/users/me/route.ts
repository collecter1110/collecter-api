import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { uploadImageAndSave, deleteImageById } from "@/lib/storage";
import {
  getSelectionHomeMap,
  isSelectionVisibleToViewer,
} from "@/lib/selectionVisibility";

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

  // 카운트용 매핑 목록을 데이터째 조회한다.
  // (집계 후 home 이 비공개인 셀렉션은 제외하기 위해 셀렉션 ID 가 필요함)
  const [userResult, selectingRows, selectedRows, likeResult] = await Promise.all([
    getSupabase()
      .from("userinfo")
      .select("user_id, name, email, description, image_id")
      .eq("user_id", auth.userId)
      .single(),
    // 내가 셀렉팅한 매핑: 내가 추가했지만 내가 owner가 아닌 것
    getSupabase()
      .from("collection_selections")
      .select("selection_id, selections!inner(owner_id)")
      .eq("user_id", auth.userId)
      .neq("selections.owner_id", auth.userId),
    // 셀렉팅 당한 매핑: 내가 owner인 셀렉션을 다른 유저가 추가한 것
    getSupabase()
      .from("collection_selections")
      .select("selection_id, selections!inner(owner_id)")
      .eq("selections.owner_id", auth.userId)
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

  // home(원본 컬렉션)이 비공개인 셀렉팅은 카운트에서 제외한다.
  const selectingSelIds = ((selectingRows.data ?? []) as { selection_id: number }[])
    .map((r) => r.selection_id);
  const selectedSelIds = ((selectedRows.data ?? []) as { selection_id: number }[])
    .map((r) => r.selection_id);

  const allIds = Array.from(new Set([...selectingSelIds, ...selectedSelIds]));
  const homeMap = allIds.length > 0 ? await getSelectionHomeMap(allIds) : new Map();

  const selecting_count = selectingSelIds.filter((sid) =>
    // 뷰어는 auth.userId, 이 케이스는 owner != auth.userId 이므로 isPublic 이어야만 true
    isSelectionVisibleToViewer(homeMap.get(sid), auth.userId)
  ).length;

  // selected 는 뷰어 본인이 원작자라 visibleToViewer 로는 늘 true 가 된다.
  // 여기선 "외부에 공개되는 개수" 로 해석해 home 이 공개인 것만 카운트.
  const selected_count = selectedSelIds.filter((sid) => {
    const home = homeMap.get(sid);
    return !home || home.isPublic;
  }).length;

  const { name, ...rest } = userResult.data;
  return apiResponse({
    user: {
      ...rest,
      user_name: name,
      selecting_count,
      selected_count,
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
