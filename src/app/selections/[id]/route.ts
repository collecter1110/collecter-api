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
import { recalcCollectionSelectionNums } from "@/lib/collectionStats";
import { ensureKeywordsInCategory, parseKeywordsJson } from "@/lib/keywords";
import {
  getSelectionHome,
  isSelectionVisibleToViewer,
} from "@/lib/selectionVisibility";

/**
 * @openapi
 * /selections/{id}:
 *   get:
 *     tags: [Selections]
 *     summary: 셀렉션 상세 조회
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 789
 *       - in: query
 *         name: collection_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 조회 컨텍스트의 컬렉션 ID
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
 *                       id: 789
 *                       category_id: 1
 *                       collection_id: 123
 *                       owner_id: 45
 *                       selection_title: 내 셀렉션
 *                       description: 셀렉션 설명
 *                       is_ordered: false
 *                       link: null
 *                       items: null
 *                       keywords:
 *                         - keyword_id: 7
 *                           keyword_name: 키워드
 *                       created_at: "2026-04-06"
 *                       owner_name: gimgahui
 *                       is_selectable: true
 *                       has_selecting: false
 *                       selection_images:
 *                         - image_id: "7c2c8fb0-4d1b-4bd1-9e2c-9a0c5d6d2d3a"
 *                           sort_order: 0
 *       400:
 *         description: 잘못된 요청 (id 또는 collection_id 누락/형식 오류)
 *       404:
 *         description: |
 *           셀렉션을 찾을 수 없음. `errorCode`로 사유를 구분한다.
 *           - `SU001`: 삭제된 컬렉션/셀렉션 — 셀렉션 또는 컨텍스트 컬렉션이 존재하지 않음
 *           - `SU002`: 비공개 컬렉션 — 컨텍스트 컬렉션 또는 원작 홈 컬렉션이 비공개이며 요청 유저에게 권한이 없음
 *           - `SU003`: 차단 — 요청 유저와 컬렉션 소유자가 서로 차단했거나 차단당함 (양방향)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               notFound:
 *                 summary: SU001 — 삭제된 컬렉션/셀렉션
 *                 value:
 *                   errorCode: SU001
 *                   msg: Selection not found
 *                   data: {}
 *               private:
 *                 summary: SU002 — 비공개 컬렉션
 *                 value:
 *                   errorCode: SU002
 *                   msg: Selection not found
 *                   data: {}
 *               blocked:
 *                 summary: SU003 — 차단 (차단하거나 차단당함)
 *                 value:
 *                   errorCode: SU003
 *                   msg: Selection not found
 *                   data: {}
 *       500:
 *         description: 서버 오류
 *   patch:
 *     tags: [Selections]
 *     summary: 셀렉션 수정
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 789
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
 *               link:
 *                 type: string
 *               items:
 *                 type: string
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
 *     responses:
 *       200:
 *         description: 수정 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [errorCode, msg, data]
 *               properties:
 *                 errorCode:
 *                   type: string
 *                   example: SU000
 *                 msg:
 *                   type: string
 *                   example: ok
 *                 data:
 *                   type: object
 *                   required: [success]
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     success: true
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               invalidId:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Invalid ID
 *                   data: {}
 *               keywordsRequired:
 *                 value:
 *                   errorCode: SU000
 *                   msg: keywords is required
 *                   data: {}
 *               keywordsInvalid:
 *                 value:
 *                   errorCode: SU000
 *                   msg: keywords must be a non-empty JSON array of strings
 *                   data: {}
 *       401:
 *         description: 인증 필요
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *       403:
 *         description: 권한 없음 (소유자만 수정 가능)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               forbidden:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Only the owner can edit this selection
 *                   data: {}
 *       404:
 *         description: 셀렉션을 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               notFound:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Selection not found
 *                   data: {}
 *       500:
 *         description: 수정 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               updateFailed:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to update selection
 *                   data: {}
 *               keywordSaveFailed:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to save keywords
 *                   data: {}
 *   delete:
 *     tags: [Selections]
 *     summary: 셀렉션 삭제 (소유자만)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 789
 *     responses:
 *       200:
 *         description: 삭제 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [errorCode, msg, data]
 *               properties:
 *                 errorCode:
 *                   type: string
 *                   example: SU000
 *                 msg:
 *                   type: string
 *                   example: ok
 *                 data:
 *                   type: object
 *                   required: [success]
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     success: true
 *       400:
 *         description: 잘못된 ID
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               invalidId:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Invalid ID
 *                   data: {}
 *       401:
 *         description: 인증 필요
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *       403:
 *         description: 권한 없음 (소유자만 삭제 가능)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *       404:
 *         description: 셀렉션을 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               notFound:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Selection not found
 *                   data: {}
 *       500:
 *         description: 삭제 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               deleteFailed:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to delete selection
 *                   data: {}
 */

type Params = { params: Promise<{ id: string }> };

// GET /selections/:id
export async function GET(request: NextRequest, { params }: Params) {
  const { id: idParam } = await params;
  const id = parseInt(idParam, 10);

  if (isNaN(id)) {
    return apiError("Invalid ID", 400);
  }

  const auth = await getAuthContext(request);

  // collection_id: 조회 컨텍스트의 컬렉션 ID (필수)
  const collectionIdParam = request.nextUrl.searchParams.get("collection_id");
  if (!collectionIdParam) {
    return apiError("collection_id is required", 400);
  }
  const collectionId = parseInt(collectionIdParam, 10);
  if (isNaN(collectionId)) {
    return apiError("Invalid collection_id", 400);
  }

  const { data, error } = await getSupabase()
    .from("selections")
    .select(
      `id, category_id, owner_id, title, description,
       is_ordered, link, items, keywords, created_at, owner_name, is_selectable,
       selection_images(image_id, sort_order)`
    )
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return apiError("Selection not found", 404, "SU001");
    }
    console.error("getSelectionDetail error:", error);
    return apiError("Failed to fetch selection", 500);
  }

  // 비공개 컬렉션 체크
  const { data: collection, error: colError } = await getSupabase()
    .from("collections")
    .select("user_id, is_public")
    .eq("id", collectionId)
    .single();

  if (colError || !collection) {
    return apiError("Selection not found", 404, "SU001");
  }

  if (!collection.is_public && auth?.userId !== collection.user_id) {
    return apiError("Selection not found", 404, "SU002");
  }

  if (auth && auth.userId !== collection.user_id) {
    const blockedIds = await getBlockedUserIds(auth.userId);
    if (blockedIds.includes(collection.user_id as number)) {
      return apiError("Selection not found", 404, "SU003");
    }
  }

  // 원본(home) 컬렉션 기준 비공개 필터: 원작자의 홈 컬렉션이 비공개이면
  // 원작자 외에는 어떤 맥락에서 조회하든 숨긴다.
  const home = await getSelectionHome(id);
  if (!isSelectionVisibleToViewer(home, auth?.userId ?? null)) {
    return apiError("Selection not found", 404, "SU002");
  }

  // has_selecting: 로그인 유저가 이 셀렉션을 셀렉팅했는지 여부
  let hasSelecting = false;
  if (auth && auth.userId !== data.owner_id) {
    const { data: csRow } = await getSupabase()
      .from("collection_selections")
      .select("collection_id")
      .eq("selection_id", id)
      .eq("user_id", auth.userId)
      .limit(1)
      .maybeSingle();

    hasSelecting = !!csRow;
  }

  const { title, ...rest } = data;
  return apiResponse({
    selection: {
      ...rest,
      selection_title: title,
      collection_id: collectionId,
      has_selecting: hasSelecting,
    },
  });
}

// PATCH /selections/:id
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { id: idParam } = await params;
  const id = parseInt(idParam, 10);

  if (isNaN(id)) {
    return apiError("Invalid ID", 400);
  }

  // 소유자만 수정 가능
  const { data: selection } = await getSupabase()
    .from("selections")
    .select("owner_id")
    .eq("id", id)
    .single();

  if (!selection) {
    return apiError("Selection not found", 404);
  }

  if (selection.owner_id !== auth.userId) {
    return apiError("Only the owner can edit this selection", 403);
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
  if (category_idRaw !== null) updates.category_id = parseInt(category_idRaw, 10);
  if (title !== null) updates.title = title;
  if (description !== null) updates.description = description;
  if (linkRaw !== null) updates.link = linkRaw;
  if (itemsRaw !== null) updates.items = JSON.parse(itemsRaw);
  if (is_orderedRaw !== null) updates.is_ordered = is_orderedRaw === "true";
  if (is_selectableRaw !== null) updates.is_selectable = is_selectableRaw !== "false";

  if (keywordsRaw === null) {
    return apiError("keywords is required", 400);
  }

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
              .eq("id", id)
              .single()
          ).data?.category_id;

      if (categoryIdForKeywords === undefined || categoryIdForKeywords === null) {
        return apiError("Selection not found", 404);
      }

      updates.keywords = await ensureKeywordsInCategory(categoryIdForKeywords, parsedNames);
    } catch (err) {
      console.error("Failed to save keywords:", err);
      return apiError("Failed to save keywords", 500);
    }
  }

  // 매핑 테이블에서 컬렉션 ID 조회 (커버 복구용)
  const { data: csData } = await getSupabase()
    .from("collection_selections")
    .select("collection_id")
    .eq("selection_id", id);

  const collectionIds = (csData ?? []).map((r) => r.collection_id);

  if (Object.keys(updates).length > 0) {
    const { error } = await getSupabase()
      .from("selections")
      .update(updates)
      .eq("id", id);

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
      .eq("selection_id", id);

    const deletedIds: string[] = [];
    for (const si of existingImgs ?? []) {
      if (!keepIds.includes(si.image_id)) {
        deletedIds.push(si.image_id);
      }
    }

    if (deletedIds.length > 0) {
      await getSupabase()
        .from("selection_images")
        .delete()
        .eq("selection_id", id)
        .in("image_id", deletedIds);
    }

    for (const colId of collectionIds) {
      await repairCollectionCoverIfUsingDeletedImage(colId, deletedIds);
    }
  }

  // 새 이미지 추가
  if (imageFiles.length > 0) {
    const { data: lastImg } = await getSupabase()
      .from("selection_images")
      .select("sort_order")
      .eq("selection_id", id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    let nextSortOrder = (lastImg?.sort_order ?? -1) + 1;

    for (const file of imageFiles) {
      if (!file || file.size === 0) continue;
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const { imageId } = await uploadImageAndSave(buffer, file.type);
        await getSupabase().from("selection_images").insert({
          selection_id: id,
          image_id: imageId,
          sort_order: nextSortOrder++,
        });

        for (const colId of collectionIds) {
          await ensureCollectionCoverIfEmpty(colId, imageId);
        }
      } catch (err) {
        console.error("Failed to upload selection image:", err);
      }
    }
  }

  return apiResponse({ success: true });
}

// DELETE /selections/:id
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { id: idParam } = await params;
  const id = parseInt(idParam, 10);

  if (isNaN(id)) {
    return apiError("Invalid ID", 400);
  }

  // 셀렉션 소유자 확인
  const { data: selection } = await getSupabase()
    .from("selections")
    .select("owner_id")
    .eq("id", id)
    .single();

  if (!selection) {
    return apiError("Selection not found", 404);
  }

  if (selection.owner_id !== auth.userId) {
    return apiError("Only the owner can delete this selection", 403);
  }

  // 소유자인 경우: 셀렉션 자체 삭제 (cascade로 매핑도 삭제됨)
  const { data: csData } = await getSupabase()
    .from("collection_selections")
    .select("collection_id")
    .eq("selection_id", id);

  const collectionIds = (csData ?? []).map((r) => r.collection_id);

  const { data: selImgs } = await getSupabase()
    .from("selection_images")
    .select("image_id")
    .eq("selection_id", id);

  const deletedIds = (selImgs ?? []).map((x) => x.image_id);

  // 이미지 삭제
  for (const si of selImgs ?? []) {
    await deleteImageById(si.image_id);
  }

  const { error } = await getSupabase()
    .from("selections")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deleteSelection error:", error);
    return apiError("Failed to delete selection", 500);
  }

  await recalcCollectionSelectionNums(collectionIds);

  // 관련 컬렉션 커버 복구
  for (const colId of collectionIds) {
    await repairCollectionCoverIfUsingDeletedImage(colId, deletedIds);
  }

  return apiResponse({ success: true });
}
