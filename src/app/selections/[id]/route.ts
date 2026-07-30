import { NextRequest, NextResponse, after } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth, getAuthContext } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";
import { storeOptimizedImage, deleteImageById } from "@/lib/storage";
import {
  SELECTION_IMAGE_PRESET,
  optimizeUploadedImages,
  isRejectableImageError,
} from "@/lib/image";
import {
  ensureCollectionCoverIfEmpty,
  repairCollectionCoverIfUsingDeletedImage,
} from "@/lib/collectionCover";
import { recalcCollectionSelectionNums } from "@/lib/collectionStats";
import { ensureKeywordsInCategory, parseKeywordsJson } from "@/lib/keywords";
import { emptyToNull } from "@/lib/formData";
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
 *                       created_at: "2026-04-06T12:34:56.000Z"
 *                       owner_name: gimgahui
 *                       user_id: 45
 *                       user_image_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
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
 *                 description: |
 *                   유지할 기존 image_id JSON 배열. 빈 배열이면 전체 삭제.
 *                   **배열 순서가 곧 이미지 순서**이며, 이 순서대로 `sort_order`가 0부터 다시 부여된다.
 *                   새로 업로드한 `images`는 그 뒤에 파일 순서대로 이어 붙는다.
 *                   생략하면 기존 이미지의 순서를 그대로 두고 새 이미지만 맨 뒤에 추가한다.
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

  // 독립적인 조회들을 병렬 실행 (검사 순서는 아래에서 기존과 동일하게 유지)
  const [
    { data, error },
    { data: collection, error: colError },
    home,
    blockedIds,
  ] = await Promise.all([
    getSupabase()
      .from("selections")
      .select(
        `id, category_id, owner_id, title, description,
         is_ordered, link, items, keywords, created_at, owner_name, is_selectable,
         selection_images(image_id, sort_order)`
      )
      .eq("id", id)
      .single(),
    getSupabase()
      .from("collections")
      .select("user_id, is_public")
      .eq("id", collectionId)
      .single(),
    // 원본(home) 컬렉션 기준 비공개 필터용 정보
    getSelectionHome(id),
    auth ? getBlockedUserIds(auth.userId) : Promise.resolve([]),
  ]);

  if (error) {
    if (error.code === "PGRST116") {
      return apiError("Selection not found", 404, "SU001");
    }
    console.error("getSelectionDetail error:", error);
    return apiError("Failed to fetch selection", 500);
  }

  // 비공개 컬렉션 체크
  if (colError || !collection) {
    return apiError("Selection not found", 404, "SU001");
  }

  if (!collection.is_public && auth?.userId !== collection.user_id) {
    return apiError("Selection not found", 404, "SU002");
  }

  if (auth && auth.userId !== collection.user_id) {
    if (blockedIds.includes(collection.user_id as number)) {
      return apiError("Selection not found", 404, "SU003");
    }
  }

  // 원본(home) 컬렉션 기준 비공개 필터: 원작자의 홈 컬렉션이 비공개이면
  // 원작자 외에는 어떤 맥락에서 조회하든 숨긴다.
  if (!isSelectionVisibleToViewer(home, auth?.userId ?? null)) {
    return apiError("Selection not found", 404, "SU002");
  }

  // has_selecting: 로그인 유저가 이 셀렉션을 셀렉팅했는지 여부
  // 작성자(owner) 프로필 이미지 조회 (userinfo.image_id) — 병렬 실행
  const [csRowResult, { data: ownerInfo }] = await Promise.all([
    auth && auth.userId !== data.owner_id
      ? getSupabase()
          .from("collection_selections")
          .select("collection_id")
          .eq("selection_id", id)
          .eq("user_id", auth.userId)
          .limit(1)
          .maybeSingle()
      : Promise.resolve(null),
    getSupabase()
      .from("userinfo")
      .select("image_id")
      .eq("user_id", data.owner_id)
      .maybeSingle(),
  ]);

  const hasSelecting = !!csRowResult?.data;

  // 임베드된 selection_images는 PostgREST가 순서를 보장하지 않으므로
  // 공개 API(serializeSelectionDetail)와 동일하게 sort_order로 정렬해 내려준다.
  const { title, selection_images, ...rest } = data;
  const images = [
    ...((selection_images ?? []) as { image_id: string; sort_order: number }[]),
  ].sort((a, b) => a.sort_order - b.sort_order);

  return apiResponse({
    selection: {
      ...rest,
      selection_images: images,
      selection_title: title,
      collection_id: collectionId,
      user_id: data.owner_id,
      user_image_id: (ownerInfo?.image_id as string | null) ?? null,
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

  // 소유자만 수정 가능 (keywords 처리용 category_id도 함께 조회해 추가 쿼리 제거)
  const { data: selection } = await getSupabase()
    .from("selections")
    .select("owner_id, category_id")
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
  if (description !== null) updates.description = emptyToNull(description);
  if (linkRaw !== null) updates.link = emptyToNull(linkRaw);
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
          : selection.category_id;

      if (categoryIdForKeywords === undefined || categoryIdForKeywords === null) {
        return apiError("Selection not found", 404);
      }

      updates.keywords = await ensureKeywordsInCategory(categoryIdForKeywords, parsedNames);
    } catch (err) {
      console.error("Failed to save keywords:", err);
      return apiError("Failed to save keywords", 500);
    }
  }

  // 이미지 검증·최적화를 셀렉션 수정보다 먼저 끝낸다.
  // 잘못된 이미지로 400을 반환할 때 본문만 바뀌는 상황을 막기 위한 순서다.
  let optimizedImages: Buffer[];
  try {
    optimizedImages = await optimizeUploadedImages(imageFiles, SELECTION_IMAGE_PRESET);
  } catch (err) {
    if (isRejectableImageError(err)) {
      // 기존 앱 업로드가 새 제한에 걸리는지 배포 후 확인할 수 있도록 사유를 남긴다.
      console.warn("selection image rejected (edit):", (err as Error).message);
      return apiError("Unsupported, corrupted, or oversized image file", 400);
    }
    console.error("editSelection image optimize error:", err);
    return apiError("Failed to process image", 500);
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

  // 이미지 업데이트: keep_image_ids가 있으면 명시된 것 외 삭제.
  // 배열 순서가 곧 유지할 이미지의 순서이므로 그 순서대로 sort_order를 0부터 다시 매기고,
  // 새로 업로드된 이미지는 그 뒤에 이어 붙인다.
  let nextSortOrder: number | null = null;

  if (keepImageIdsRaw !== null) {
    const keepIds: string[] = JSON.parse(keepImageIdsRaw);
    const { data: existingImgs } = await getSupabase()
      .from("selection_images")
      .select("image_id, sort_order")
      .eq("selection_id", id);

    const existing = (existingImgs ?? []) as {
      image_id: string;
      sort_order: number;
    }[];
    const existingById = new Map(existing.map((si) => [si.image_id, si]));

    // 실제로 존재하는 image_id만, 배열에 처음 등장한 순서대로 (중복/유령 id 방어)
    const orderedKeepIds = keepIds.filter(
      (imageId, i) => existingById.has(imageId) && keepIds.indexOf(imageId) === i
    );
    const keepIdSet = new Set(orderedKeepIds);

    const deletedIds = existing
      .filter((si) => !keepIdSet.has(si.image_id))
      .map((si) => si.image_id);

    if (deletedIds.length > 0) {
      await getSupabase()
        .from("selection_images")
        .delete()
        .eq("selection_id", id)
        .in("image_id", deletedIds);
    }

    // sort_order에는 unique 제약이 없으므로 중간 상태 충돌 없이 병렬 갱신할 수 있다.
    await Promise.all(
      orderedKeepIds
        .map((imageId, i) => ({ imageId, i }))
        .filter(({ imageId, i }) => existingById.get(imageId)!.sort_order !== i)
        .map(({ imageId, i }) =>
          getSupabase()
            .from("selection_images")
            .update({ sort_order: i })
            .eq("selection_id", id)
            .eq("image_id", imageId)
        )
    );

    nextSortOrder = orderedKeepIds.length;

    for (const colId of collectionIds) {
      await repairCollectionCoverIfUsingDeletedImage(colId, deletedIds);
    }
  }

  // 새 이미지 추가
  if (optimizedImages.length > 0) {
    // keep_image_ids가 없으면 기존 이미지를 그대로 두고 뒤에만 이어 붙인다.
    if (nextSortOrder === null) {
      const { data: lastImg } = await getSupabase()
        .from("selection_images")
        .select("sort_order")
        .eq("selection_id", id)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      nextSortOrder =
        ((lastImg?.sort_order as number | undefined) ?? -1) + 1;
    }

    // 저장에 실패한 이미지는 번호를 소비하지 않아 sort_order가 연속으로 유지된다.
    let sortOrder: number = nextSortOrder;

    for (const optimized of optimizedImages) {
      try {
        // 이미 검증·최적화가 끝난 버퍼이므로 여기서는 저장만 한다.
        const { imageId } = await storeOptimizedImage(optimized);
        await getSupabase().from("selection_images").insert({
          selection_id: id,
          image_id: imageId,
          sort_order: sortOrder++,
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
  const [{ data: csData }, { data: selImgs }] = await Promise.all([
    getSupabase()
      .from("collection_selections")
      .select("collection_id")
      .eq("selection_id", id),
    getSupabase()
      .from("selection_images")
      .select("image_id")
      .eq("selection_id", id),
  ]);

  const collectionIds = (csData ?? []).map((r) => r.collection_id);
  const deletedIds = (selImgs ?? []).map((x) => x.image_id);

  const { error } = await getSupabase()
    .from("selections")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deleteSelection error:", error);
    return apiError("Failed to delete selection", 500);
  }

  // 이미지 삭제 / 셀렉션 수 재계산 / 커버 복구는 응답에 영향이 없는 후처리이므로
  // 응답 전송 후 기존 순서 그대로 순차 실행한다.
  after(async () => {
    try {
      for (const si of selImgs ?? []) {
        await deleteImageById(si.image_id);
      }

      await recalcCollectionSelectionNums(collectionIds);

      // 관련 컬렉션 커버 복구
      for (const colId of collectionIds) {
        await repairCollectionCoverIfUsingDeletedImage(colId, deletedIds);
      }
    } catch (err) {
      console.error("deleteSelection post-response cleanup error:", err);
    }
  });

  return apiResponse({ success: true });
}
