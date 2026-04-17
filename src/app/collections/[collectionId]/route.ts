import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth, getAuthContext } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";
import { deleteImageById } from "@/lib/storage";

/**
 * @openapi
 * /collections/{collectionId}:
 *   get:
 *     tags: [Collections]
 *     summary: 컬렉션 상세 조회
 *     description: 컬렉션 ID로 상세 정보를 가져옵니다. 비공개 컬렉션은 소유자만 조회 가능합니다.
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 123
 *       - in: header
 *         name: Authorization
 *         required: false
 *         schema:
 *           type: string
 *         description: Bearer access token (optional, 좋아요 여부 확인용)
 *         example: Bearer eyJhbGciOi...
 *     responses:
 *       200:
 *         description: 컬렉션 상세 정보
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [collection]
 *               properties:
 *                 collection:
 *                   $ref: "#/components/schemas/CollectionDetail"
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     collection:
 *                       collection_id: 123
 *                       category_id: 1
 *                       description: 컬렉션 설명
 *                       created_at: "2026-04-06T12:34:56.000Z"
 *                       image_id: "b7c6f3b0-6a0f-4b4a-9a90-2c02e4a2b9a1"
 *                       tags: ["태그1", "태그2"]
 *                       user_id: 45
 *                       user_name: gimgahui
 *                       primary_keywords:
 *                         - keyword_id: 7
 *                           keyword_name: 키워드
 *                           count: 3
 *                       selection_num: 12
 *                       like_num: 34
 *                       is_public: true
 *                       collection_title: 내 컬렉션
 *                       has_liked: false
 *       404:
 *         description: 컬렉션을 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Collection not found
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
 *                   msg: Failed to fetch collection
 *                   data: {}
 *   patch:
 *     tags: [Collections]
 *     summary: 컬렉션 수정
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 123
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               category_id:
 *                 type: integer
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               tags:
 *                 type: string
 *                 description: "JSON 배열 문자열 (예: '[\"태그1\",\"태그2\"]')"
 *               is_public:
 *                 type: string
 *                 description: 비공개이면 "false"
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
 *                   msg: Failed to update collection
 *                   data: {}
 *   delete:
 *     tags: [Collections]
 *     summary: 컬렉션 삭제
 *     description: 컬렉션과 연관된 이미지, 셀렉션 이미지를 모두 삭제합니다.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 123
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
 *       404:
 *         description: 컬렉션을 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Collection not found
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
 *                   msg: Failed to delete collection
 *                   data: {}
 */

type Params = { params: Promise<{ collectionId: string }> };

// GET /collections/:collectionId — getCollectionDetail
export async function GET(request: NextRequest, { params }: Params) {
  const { collectionId: idParam } = await params;
  const collectionId = parseInt(idParam, 10);
  if (isNaN(collectionId)) {
    return apiError("Invalid collection ID", 400);
  }

  const auth = await getAuthContext(request);

  const { data, error } = await getSupabase()
    .from("collections")
    .select(
      `category_id, id, title, description, created_at, image_id,
       tags, user_id, user_name, primary_keywords, selection_num, like_num,
       likes(user_id), is_public`
    )
    .eq("id", collectionId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return apiError("Collection not found", 404);
    }
    console.error("getCollectionDetail error:", error);
    return apiError("Failed to fetch collection", 500);
  }

  if (!data.is_public && auth?.userId !== data.user_id) {
    return apiError("Collection not found", 404);
  }

  if (auth && auth.userId !== data.user_id) {
    const blockedIds = await getBlockedUserIds(auth.userId);
    if (blockedIds.includes(data.user_id as number)) {
      return apiError("Collection not found", 404);
    }
  }

  const hasLiked = auth
    ? (data.likes as { user_id: number }[]).some((l) => l.user_id === auth.userId)
    : false;

  const { likes: _likes, title, id, ...rest } = data;
  return apiResponse({
    collection: {
      ...rest,
      collection_id: id,
      collection_title: title,
      has_liked: hasLiked,
    },
  });
}

// PATCH /collections/:collectionId — editCollection
// body: multipart/form-data { category_id?, title?, description?, tags?, is_public? }
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { collectionId: idParam } = await params;
  const collectionId = parseInt(idParam, 10);
  if (isNaN(collectionId)) {
    return apiError("Invalid collection ID", 400);
  }

  const formData = await request.formData();
  const category_idRaw = formData.get("category_id") as string | null;
  const title = formData.get("title") as string | null;
  const description = formData.get("description") as string | null;
  const tagsRaw = formData.get("tags") as string | null;
  const is_publicRaw = formData.get("is_public") as string | null;

  const updates: Record<string, unknown> = {};
  if (category_idRaw) updates.category_id = parseInt(category_idRaw, 10);
  if (title !== null) updates.title = title;
  if (description !== null) updates.description = description;
  if (tagsRaw !== null) updates.tags = JSON.parse(tagsRaw);
  if (is_publicRaw !== null) updates.is_public = is_publicRaw !== "false";

  const { error } = await getSupabase()
    .from("collections")
    .update(updates)
    .eq("id", collectionId);

  if (error) {
    console.error("editCollection error:", error);
    return apiError("Failed to update collection", 500);
  }

  return apiResponse({ success: true });
}

// DELETE /collections/:collectionId — deleteCollection
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { collectionId: idParam } = await params;
  const collectionId = parseInt(idParam, 10);
  if (isNaN(collectionId)) {
    return apiError("Invalid collection ID", 400);
  }

  const { data: collection, error: fetchError } = await getSupabase()
    .from("collections")
    .select("image_id, user_id")
    .eq("id", collectionId)
    .single();

  if (fetchError) {
    return apiError("Collection not found", 404);
  }

  // 이 컬렉션에 매핑된 셀렉션 조회 (내가 만든 것 vs 셀렉팅한 것 구분)
  const { data: csData } = await getSupabase()
    .from("collection_selections")
    .select("selection_id, selections!inner(owner_id)")
    .eq("collection_id", collectionId);

  type CSRow = { selection_id: number; selections: { owner_id: number } };
  const mappings = (csData ?? []) as unknown as CSRow[];

  const ownedSelectionIds = mappings
    .filter((r) => r.selections.owner_id === auth.userId)
    .map((r) => r.selection_id);

  // 셀렉팅한 셀렉션은 매핑만 제거
  await getSupabase()
    .from("collection_selections")
    .delete()
    .eq("collection_id", collectionId);

  // 내가 만든 셀렉션의 이미지 삭제
  for (const selId of ownedSelectionIds) {
    const { data: selImgs } = await getSupabase()
      .from("selection_images")
      .select("image_id")
      .eq("selection_id", selId);

    for (const si of selImgs ?? []) {
      await deleteImageById(si.image_id);
    }
  }

  // 내가 만든 셀렉션 삭제
  if (ownedSelectionIds.length > 0) {
    await getSupabase()
      .from("selections")
      .delete()
      .in("id", ownedSelectionIds);
  }

  // 컬렉션 대표 이미지 삭제
  if (collection.image_id) {
    await deleteImageById(collection.image_id);
  }

  // 컬렉션 삭제
  const { error } = await getSupabase()
    .from("collections")
    .delete()
    .eq("id", collectionId);

  if (error) {
    console.error("deleteCollection error:", error);
    return apiError("Failed to delete collection", 500);
  }

  return apiResponse({ success: true });
}
