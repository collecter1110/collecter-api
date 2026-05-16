import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth, getAuthContext } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";
import { uploadImageAndSave } from "@/lib/storage";
import { ensureCollectionCoverIfEmpty } from "@/lib/collectionCover";
import { recalcCollectionSelectionNum } from "@/lib/collectionStats";
import { ensureKeywordsInCategory, parseKeywordsJson } from "@/lib/keywords";
import { emptyToNull } from "@/lib/formData";
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

  const auth = await getAuthContext(request);

  const { data: collection, error: collectionError } = await getSupabase()
    .from("collections")
    .select("user_id, is_public")
    .eq("id", collectionId)
    .single();

  if (collectionError) {
    return apiError("Collection not found", 404);
  }

  if (!collection.is_public && auth?.userId !== collection.user_id) {
    return apiError("Collection not found", 404);
  }

  if (auth && auth.userId !== collection.user_id) {
    const blockedIds = await getBlockedUserIds(auth.userId);
    if (blockedIds.includes(collection.user_id as number)) {
      return apiError("Collection not found", 404);
    }
  }

  const { data, error } = await getSupabase()
    .from("collection_selections")
    .select(
      `collection_id, selections(
        id, category_id, title, keywords, owner_name, owner_id,
        selection_images(image_id, sort_order)
      )`
    )
    .eq("collection_id", collectionId);

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
  let visibleRows = csRows;
  if (csRows.length > 0) {
    const homeMap = await getSelectionHomeMap(csRows.map((r) => r.selections.id));
    visibleRows = csRows.filter((row) =>
      isSelectionVisibleToViewer(homeMap.get(row.selections.id), viewerId)
    );
  }

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

  let keywordEntries;
  try {
    keywordEntries = await ensureKeywordsInCategory(category_id, keywords);
  } catch (err) {
    console.error("Failed to save keywords:", err);
    return apiError("Failed to save keywords", 500);
  }

  const { data: newSelection, error } = await getSupabase()
    .from("selections")
    .insert({
      category_id,
      owner_id: auth.userId,
      owner_name: auth.name,
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

  await recalcCollectionSelectionNum(collectionId);

  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    if (!file || file.size === 0) continue;
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const { imageId } = await uploadImageAndSave(
        buffer,
        file.type
      );
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

  return apiResponse({ success: true }, 201);
}
