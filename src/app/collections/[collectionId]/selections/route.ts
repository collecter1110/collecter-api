import { NextRequest, NextResponse, after } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth, optionalAuth } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";
import { storeOptimizedImage } from "@/lib/storage";
import {
  SELECTION_IMAGE_PRESET,
  optimizeUploadedImages,
  isRejectableImageError,
} from "@/lib/image";
import { ensureCollectionCoverIfEmpty } from "@/lib/collectionCover";
import { recalcCollectionSelectionNum } from "@/lib/collectionStats";
import { ensureKeywordsInCategory, parseKeywordsJson } from "@/lib/keywords";
import { emptyToNull } from "@/lib/formData";
import { getUserImageMap, getUserName } from "@/lib/userInfo";
import {
  getSelectionHomeMap,
  isSelectionVisibleToViewer,
} from "@/lib/selectionVisibility";

/**
 * @openapi
 * /collections/{collectionId}/selections:
 *   get:
 *     tags: [Selections]
 *     summary: 컬렉션의 셀렉션 목록 조회
 *     description: 컬렉션에 속한 셀렉션 목록을 반환합니다. 비공개 컬렉션은 소유자만 조회 가능합니다.
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
 *         description: Bearer access token (optional)
 *           토큰이 만료·무효하면 401 을 반환한다. 헤더를 아예 보내지 않으면 비로그인으로 간주해 200 을 반환한다.
 *         example: Bearer eyJhbGciOi...
 *     responses:
 *       200:
 *         description: 셀렉션 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [selections]
 *               properties:
 *                 selections:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/SelectionListItem"
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     selections:
 *                       - category_id: 1
 *                         collection_id: 123
 *                         id: 456
 *                         selection_title: 내 셀렉션
 *                         keywords:
 *                           - keyword_id: 7
 *                             keyword_name: 키워드
 *                         owner_name: gimgahui
 *                         owner_id: 45
 *                         owner_image_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                         image_id: "7c2c8fb0-4d1b-4bd1-9e2c-9a0c5d6d2d3a"
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
 *       401:
 *         description: >-
 *           Authorization 헤더를 보냈으나 토큰이 만료·변조되었거나 access 토큰이 아님.
 *           클라이언트는 토큰을 갱신한 뒤 재시도해야 한다.
 *           헤더를 보내지 않은 비로그인 요청은 401 이 아니라 200 이다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *             examples:
 *               error:
 *                 value:
 *                   error: Unauthorized
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
 *                   msg: Failed to fetch selections
 *                   data: {}
 *   post:
 *     tags: [Selections]
 *     summary: 셀렉션 추가
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
 *             required: [category_id, title, keywords]
 *             properties:
 *               category_id:
 *                 type: integer
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               keywords:
 *                 type: string
 *                 description: "JSON 배열 문자열 (예: '[\"키워드1\",\"키워드2\"]')"
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *               link:
 *                 type: string
 *               items:
 *                 type: string
 *                 description: JSON 배열 문자열
 *               is_ordered:
 *                 type: string
 *                 description: 순서 있는 목록이면 "true"
 *               is_selectable:
 *                 type: string
 *                 description: 퍼가기 불가이면 "false"
 *     responses:
 *       201:
 *         description: 셀렉션 추가 성공
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
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: category_id and title are required
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
 *         description: 셀렉션 추가 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to create selection
 *                   data: {}
 */

type Params = { params: Promise<{ collectionId: string }> };

// GET /collections/:collectionId/selections — getSelections
export async function GET(request: NextRequest, { params }: Params) {
  const { collectionId: idParam } = await params;
  const collectionId = parseInt(idParam, 10);

  if (isNaN(collectionId)) {
    return apiError("Invalid collection ID", 400);
  }

  const auth = await optionalAuth(request);
  if (auth instanceof NextResponse) return auth;

  // 컬렉션 확인 / 차단 목록 / 셀렉션 목록 조회를 병렬 실행
  // (검사 순서는 아래에서 기존과 동일하게 유지)
  const [
    { data: collection, error: collectionError },
    blockedIds,
    { data, error },
  ] = await Promise.all([
    getSupabase()
      .from("collections")
      .select("user_id, is_public")
      .eq("id", collectionId)
      .single(),
    auth ? getBlockedUserIds(auth.userId) : Promise.resolve([] as number[]),
    getSupabase()
      .from("collection_selections")
      .select(
        `collection_id, selections(
          id, category_id, title, keywords, owner_name, owner_id,
          selection_images(image_id, sort_order)
        )`
      )
      .eq("collection_id", collectionId),
  ]);

  if (collectionError) {
    return apiError("Collection not found", 404);
  }

  if (!collection.is_public && auth?.userId !== collection.user_id) {
    return apiError("Collection not found", 404);
  }

  if (auth && auth.userId !== collection.user_id) {
    if (blockedIds.includes(collection.user_id as number)) {
      return apiError("Collection not found", 404);
    }
  }

  if (error) {
    console.error("getSelections error:", error);
    return apiError("Failed to fetch selections", 500);
  }

  type CSRow = {
    collection_id: number;
    selections: {
      id: number;
      category_id: number;
      title: string;
      keywords: unknown;
      owner_name: string;
      owner_id: number;
      selection_images: { image_id: string; sort_order: number }[];
    };
  };

  const csRows = (data ?? []) as unknown as CSRow[];

  // 원본(home) 컬렉션이 비공개인 셀렉션은 원작자 외에는 숨김.
  // 뷰어 기준: 로그인 상태라면 auth.userId, 비로그인이면 null.
  const viewerId = auth?.userId ?? null;

  // home 조회 / 작성자(owner) 프로필 이미지 조회를 병렬 실행
  // (ownerImageMap 은 필터 전 rows 의 상위집합으로 조회해도 결과 동일)
  const [homeMap, ownerImageMap] = await Promise.all([
    csRows.length > 0
      ? getSelectionHomeMap(csRows.map((r) => r.selections.id))
      : Promise.resolve(new Map()),
    getUserImageMap(csRows.map((row) => row.selections.owner_id)),
  ]);

  const visibleRows = csRows.filter((row) =>
    isSelectionVisibleToViewer(homeMap.get(row.selections.id), viewerId)
  );

  const selections = visibleRows.map((row) => {
    const s = row.selections;
    const imgs = [...s.selection_images].sort((a, b) => a.sort_order - b.sort_order);
    return {
      id: s.id,
      category_id: s.category_id,
      collection_id: row.collection_id,
      selection_title: s.title,
      keywords: s.keywords,
      owner_name: s.owner_name,
      owner_id: s.owner_id,
      owner_image_id: ownerImageMap.get(s.owner_id) ?? null,
      image_id: imgs[0]?.image_id ?? null,
    };
  });

  return apiResponse({ selections });
}

// POST /collections/:collectionId/selections — addSelections
// body: multipart/form-data { category_id, title, description?, images?, keywords?, link?, items?, is_ordered?, is_selectable? }
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { collectionId: idParam } = await params;
  const collectionId = parseInt(idParam, 10);

  if (isNaN(collectionId)) {
    return apiError("Invalid collection ID", 400);
  }

  const formData = await request.formData();
  const category_id = parseInt(formData.get("category_id") as string, 10);
  const title = formData.get("title") as string | null;
  const description = emptyToNull(formData.get("description") as string | null);
  const keywordsRaw = formData.get("keywords") as string | null;
  const keywords = parseKeywordsJson(keywordsRaw);
  const link = emptyToNull(formData.get("link") as string | null);
  const itemsRaw = formData.get("items") as string | null;
  const items = itemsRaw ? JSON.parse(itemsRaw) : null;
  const is_ordered = formData.get("is_ordered") === "true";
  const is_selectable = formData.get("is_selectable") !== "false";
  const imageFiles = formData.getAll("images") as File[];

  if (isNaN(category_id) || !title) {
    return apiError("category_id and title are required", 400);
  }
  if (keywordsRaw === null) {
    return apiError("keywords is required", 400);
  }
  if (!keywords || keywords.length === 0) {
    return apiError("keywords must be a non-empty JSON array of strings", 400);
  }

  // 이미지 검증·최적화를 셀렉션 생성보다 먼저 끝낸다.
  // 이렇게 해야 잘못된 이미지 때문에 400을 반환할 때 빈 셀렉션이 남지 않는다.
  let optimizedImages: Buffer[];
  try {
    optimizedImages = await optimizeUploadedImages(imageFiles, SELECTION_IMAGE_PRESET);
  } catch (err) {
    if (isRejectableImageError(err)) {
      // 기존 앱 업로드가 새 제한에 걸리는지 배포 후 확인할 수 있도록 사유를 남긴다.
      console.warn("selection image rejected (create):", (err as Error).message);
      return apiError("Unsupported, corrupted, or oversized image file", 400);
    }
    console.error("addSelections image optimize error:", err);
    return apiError("Failed to process image", 500);
  }

  let keywordEntries;
  try {
    keywordEntries = await ensureKeywordsInCategory(category_id, keywords);
  } catch (err) {
    console.error("Failed to save keywords:", err);
    return apiError("Failed to save keywords", 500);
  }

  // auth.name은 토큰 발급 시점 스냅샷이라 개명 이후 어긋날 수 있으므로 DB에서 읽는다.
  const ownerName = await getUserName(auth.userId);
  if (!ownerName) {
    console.error("addSelections error: user name not found", auth.userId);
    return apiError("Failed to create selection", 500);
  }

  const { data: newSelection, error } = await getSupabase()
    .from("selections")
    .insert({
      category_id,
      owner_id: auth.userId,
      owner_name: ownerName,
      title,
      description,
      keywords: keywordEntries,
      link,
      items,
      is_ordered,
      is_selectable,
    })
    .select("id")
    .single();

  if (error || !newSelection) {
    console.error("addSelections error:", error);
    return apiError("Failed to create selection", 500);
  }

  // collection_selections 매핑 추가
  const { error: csError } = await getSupabase()
    .from("collection_selections")
    .insert({
      collection_id: collectionId,
      selection_id: newSelection.id,
      user_id: auth.userId,
    });

  if (csError) {
    console.error("collection_selections insert error:", csError);
    return apiError("Failed to create selection", 500);
  }

  for (let i = 0; i < optimizedImages.length; i++) {
    try {
      // 이미 검증·최적화가 끝난 버퍼이므로 여기서는 저장만 한다.
      const { imageId } = await storeOptimizedImage(optimizedImages[i]);
      await getSupabase().from("selection_images").insert({
        selection_id: newSelection.id,
        image_id: imageId,
        sort_order: i,
      });

      // 컬렉션 커버가 비어있으면 첫 셀렉션 이미지로 자동 설정
      if (i === 0) {
        await ensureCollectionCoverIfEmpty(collectionId, imageId);
      }
    } catch (err) {
      console.error("Failed to upload selection image:", err);
    }
  }

  // 셀렉션 수 재계산은 응답에 영향이 없는 후처리이므로 응답 후 실행
  after(async () => {
    try {
      await recalcCollectionSelectionNum(collectionId);
    } catch (err) {
      console.error("addSelections post-response recalc error:", err);
    }
  });

  return apiResponse({ success: true }, 201);
}
