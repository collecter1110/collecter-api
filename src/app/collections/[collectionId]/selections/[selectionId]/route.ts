import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth, getAuthContext } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";
import { uploadImageAndSave, deleteImageById } from "@/lib/storage";
import {
  ensureCollectionCoverIfEmpty,
  repairCollectionCoverIfUsingDeletedImage,
} from "@/lib/collectionCover";
import { ensureKeywordsInCategory, parseKeywordsJson } from "@/lib/keywords";

/**
 * @openapi
 * /collections/{collectionId}/selections/{selectionId}:
 *   get:
 *     tags: [Selections]
 *     summary: 셀렉션 상세 조회
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 123
 *       - in: path
 *         name: selectionId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 456
 *     responses:
 *       200:
 *         description: 셀렉션 상세 정보
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [selection]
 *               properties:
 *                 selection:
 *                   $ref: "#/components/schemas/SelectionDetail"
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     selection:
 *                       category_id: 1
 *                       collection_id: 123
 *                       selection_id: 456
 *                       user_id: 45
 *                       owner_id: 45
 *                       selection_title: 내 셀렉션
 *                       description: 셀렉션 설명
 *                       is_ordered: false
 *                       link: null
 *                       items: null
 *                       keywords:
 *                         - keyword_id: 7
 *                           keyword_name: 키워드
 *                       created_at: "2026-04-06T12:34:56.000Z"
 *                       owner_name: gimgahui
 *                       is_selectable: true
 *                       is_selecting: false
 *                       selection_images:
 *                         - image_id: "7c2c8fb0-4d1b-4bd1-9e2c-9a0c5d6d2d3a"
 *                           sort_order: 0
 *       404:
 *         description: 셀렉션을 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Selection not found
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
 *                   msg: Failed to fetch selection
 *                   data: {}
 *   patch:
 *     tags: [Selections]
 *     summary: 셀렉션 수정
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 123
 *       - in: path
 *         name: selectionId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 456
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [keywords]
 *             properties:
 *               category_id:
 *                 type: integer
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               keywords:
 *                 type: string
 *                 description: "JSON 배열 문자열 (예: '[\"키워드1\"]')"
 *               link:
 *                 type: string
 *               items:
 *                 type: string
 *                 description: JSON 배열 문자열
 *               is_ordered:
 *                 type: string
 *               is_selectable:
 *                 type: string
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *               keep_image_ids:
 *                 type: string
 *                 description: 유지할 기존 image_id JSON 배열. 빈 배열이면 전체 삭제.
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
 *                   msg: Failed to update selection
 *                   data: {}
 *   delete:
 *     tags: [Selections]
 *     summary: 셀렉션 삭제
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 123
 *       - in: path
 *         name: selectionId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 456
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
 *                   msg: Failed to delete selection
 *                   data: {}
 */

type Params = { params: Promise<{ collectionId: string; selectionId: string }> };

// GET /collections/:collectionId/selections/:selectionId — getSelectionDetail
export async function GET(request: NextRequest, { params }: Params) {
  const { collectionId: cIdParam, selectionId: sIdParam } = await params;
  const collectionId = parseInt(cIdParam, 10);
  const selectionId = parseInt(sIdParam, 10);

  if (isNaN(collectionId) || isNaN(selectionId)) {
    return apiError("Invalid ID", 400);
  }

  const auth = await getAuthContext(request);

  // 비공개 컬렉션 체크
  const { data: collection, error: colError } = await getSupabase()
    .from("collections")
    .select("user_id, is_public")
    .eq("id", collectionId)
    .single();

  if (colError) {
    return apiError("Selection not found", 404);
  }

  if (!collection.is_public && auth?.userId !== collection.user_id) {
    return apiError("Selection not found", 404);
  }

  // 차단 체크
  if (auth && auth.userId !== collection.user_id) {
    const blockedIds = await getBlockedUserIds(auth.userId);
    if (blockedIds.includes(collection.user_id as number)) {
      return apiError("Selection not found", 404);
    }
  }

  const { data, error } = await getSupabase()
    .from("selections")
    .select(
      `category_id, collection_id, selection_id, user_id, owner_id, title, description,
       is_ordered, link, items, keywords, created_at, owner_name, is_selectable, is_selecting,
       selection_images(image_id, sort_order)`
    )
    .eq("collection_id", collectionId)
    .eq("selection_id", selectionId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return apiError("Selection not found", 404);
    }
    console.error("getSelectionDetail error:", error);
    return apiError("Failed to fetch selection", 500);
  }

  const { title, ...rest } = data;
  return apiResponse({ selection: { ...rest, selection_title: title } });
}

// PATCH /collections/:collectionId/selections/:selectionId — editSelection
// body: multipart/form-data { ..fields.., images?(new files), keep_image_ids?(JSON string) }
// keep_image_ids: 유지할 기존 image_id 배열. 없으면 이미지 변경 안함. 빈 배열이면 전체 삭제.
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { collectionId: cIdParam, selectionId: sIdParam } = await params;
  const collectionId = parseInt(cIdParam, 10);
  const selectionId = parseInt(sIdParam, 10);

  if (isNaN(collectionId) || isNaN(selectionId)) {
    return apiError("Invalid ID", 400);
  }

  const formData = await request.formData();
  const category_idRaw = formData.get("category_id") as string | null;
  const title = formData.get("title") as string | null;
  const description = formData.get("description") as string | null;
  const keywordsRaw = formData.get("keywords") as string | null;
  const linkRaw = formData.get("link") as string | null;
  const itemsRaw = formData.get("items") as string | null;
  const is_orderedRaw = formData.get("is_ordered") as string | null;
  const is_selectableRaw = formData.get("is_selectable") as string | null;
  const imageFiles = formData.getAll("images") as File[];
  const keepImageIdsRaw = formData.get("keep_image_ids") as string | null;

  const updates: Record<string, unknown> = {};
  if (category_idRaw) updates.category_id = parseInt(category_idRaw, 10);
  if (title !== null) updates.title = title;
  if (description !== null) updates.description = description;
  if (linkRaw !== null) updates.link = linkRaw;
  if (itemsRaw !== null) updates.items = JSON.parse(itemsRaw);
  if (is_orderedRaw !== null) updates.is_ordered = is_orderedRaw === "true";
  if (is_selectableRaw !== null) updates.is_selectable = is_selectableRaw !== "false";

  if (keywordsRaw === null) {
    return apiError("keywords is required", 400);
  }

  // 키워드를 keywordinfo에 저장하고 {keyword_id, keyword_name}[] 형식으로 업데이트
  if (keywordsRaw !== null) {
    const parsedNames = parseKeywordsJson(keywordsRaw);
    if (!parsedNames || parsedNames.length === 0) {
      return apiError("keywords must be a non-empty JSON array of strings", 400);
    }

    try {
      const categoryIdForKeywords =
        category_idRaw !== null
          ? parseInt(category_idRaw, 10)
          : (
            await getSupabase()
              .from("selections")
              .select("category_id")
              .eq("collection_id", collectionId)
              .eq("selection_id", selectionId)
              .single()
          ).data?.category_id;

      if (!categoryIdForKeywords) {
        return apiError("Selection not found", 404);
      }

      updates.keywords = await ensureKeywordsInCategory(categoryIdForKeywords, parsedNames);
    } catch (err) {
      console.error("Failed to save keywords:", err);
      return apiError("Failed to save keywords", 500);
    }
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await getSupabase()
      .from("selections")
      .update(updates)
      .eq("collection_id", collectionId)
      .eq("selection_id", selectionId);

    if (error) {
      console.error("editSelection error:", error);
      return apiError("Failed to update selection", 500);
    }
  }

  // 이미지 업데이트: keep_image_ids가 있으면 명시된 것 외 삭제
  if (keepImageIdsRaw !== null) {
    const keepIds: string[] = JSON.parse(keepImageIdsRaw);
    const { data: existingImgs } = await getSupabase()
      .from("selection_images")
      .select("image_id")
      .eq("collection_id", collectionId)
      .eq("selection_id", selectionId);

    const deletedIds: string[] = [];
    for (const si of existingImgs ?? []) {
      if (!keepIds.includes(si.image_id)) {
        await deleteImageById(si.image_id);
        deletedIds.push(si.image_id);
      }
    }

    // 커버가 삭제된 이미지였으면 다른 셀렉션 이미지로 복구
    await repairCollectionCoverIfUsingDeletedImage(collectionId, deletedIds);
  }

  // 새 이미지 추가
  if (imageFiles.length > 0) {
    const { data: lastImg } = await getSupabase()
      .from("selection_images")
      .select("sort_order")
      .eq("collection_id", collectionId)
      .eq("selection_id", selectionId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    let nextSortOrder = (lastImg?.sort_order ?? -1) + 1;

    for (const file of imageFiles) {
      if (!file || file.size === 0) continue;
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const { imageId } = await uploadImageAndSave(
          buffer,
          file.type
        );
        await getSupabase().from("selection_images").insert({
          collection_id: collectionId,
          selection_id: selectionId,
          image_id: imageId,
          sort_order: nextSortOrder++,
        });

        // 컬렉션 커버가 비어있으면 자동 설정
        await ensureCollectionCoverIfEmpty(collectionId, imageId);
      } catch (err) {
        console.error("Failed to upload selection image:", err);
      }
    }
  }

  return apiResponse({ success: true });
}

// DELETE /collections/:collectionId/selections/:selectionId — deleteSelection
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { collectionId: cIdParam, selectionId: sIdParam } = await params;
  const collectionId = parseInt(cIdParam, 10);
  const selectionId = parseInt(sIdParam, 10);

  if (isNaN(collectionId) || isNaN(selectionId)) {
    return apiError("Invalid ID", 400);
  }

  const { data: selImgs } = await getSupabase()
    .from("selection_images")
    .select("image_id")
    .eq("collection_id", collectionId)
    .eq("selection_id", selectionId);

  const deletedIds = (selImgs ?? []).map((x) => x.image_id);
  for (const si of selImgs ?? []) {
    await deleteImageById(si.image_id);
  }

  const { error } = await getSupabase()
    .from("selections")
    .delete()
    .eq("collection_id", collectionId)
    .eq("selection_id", selectionId);

  if (error) {
    console.error("deleteSelection error:", error);
    return apiError("Failed to delete selection", 500);
  }

  // 커버가 방금 지운 이미지였으면 다른 셀렉션 이미지로 복구
  await repairCollectionCoverIfUsingDeletedImage(collectionId, deletedIds);

  return apiResponse({ success: true });
}
