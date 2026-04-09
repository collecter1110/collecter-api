import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireAuth, getAuthContext } from "@/lib/auth";
import { uploadImageAndSave } from "@/lib/storage";
import { ensureCollectionCoverIfEmpty } from "@/lib/collectionCover";
import { ensureKeywordsInCategory, parseKeywordsJson } from "@/lib/keywords";

/**
 * @openapi
 * /api/collections/{collectionId}/selections:
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
 *                   selections:
 *                     - category_id: 1
 *                       collection_id: 123
 *                       selection_id: 456
 *                       title: 내 셀렉션
 *                       keywords:
 *                         - keyword_id: 7
 *                           keyword_name: 키워드
 *                       owner_name: gimgahui
 *                       owner_id: 45
 *                       is_selecting: false
 *                       thumb_image_id: "7c2c8fb0-4d1b-4bd1-9e2c-9a0c5d6d2d3a"
 *                       selection_images:
 *                         - image_id: "7c2c8fb0-4d1b-4bd1-9e2c-9a0c5d6d2d3a"
 *                           sort_order: 0
 *       404:
 *         description: 컬렉션을 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: Collection not found
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: Failed to fetch selections
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
 *                   success: true
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: category_id and title are required
 *       401:
 *         description: 인증 필요
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: Unauthorized
 *       500:
 *         description: 셀렉션 추가 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: Failed to create selection
 */

type Params = { params: Promise<{ collectionId: string }> };

// GET /api/collections/:collectionId/selections — getSelections
export async function GET(request: NextRequest, { params }: Params) {
  const { collectionId: idParam } = await params;
  const collectionId = parseInt(idParam, 10);

  if (isNaN(collectionId)) {
    return NextResponse.json({ error: "Invalid collection ID" }, { status: 400 });
  }

  const auth = await getAuthContext(request);

  const { data: collection, error: collectionError } = await getSupabase()
    .from("collections")
    .select("user_id, is_public")
    .eq("id", collectionId)
    .single();

  if (collectionError) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  if (!collection.is_public && auth?.userId !== collection.user_id) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  const { data, error } = await getSupabase()
    .from("selections")
    .select(
      `category_id, collection_id, selection_id, title, keywords, owner_name, owner_id, is_selecting,
       selection_images(image_id, sort_order)`
    )
    .eq("collection_id", collectionId);

  if (error) {
    console.error("getSelections error:", error);
    return NextResponse.json({ error: "Failed to fetch selections" }, { status: 500 });
  }

  const selections = (data ?? []).map((item) => {
    const imgs = (item.selection_images as unknown as { image_id: string; sort_order: number }[])
      .sort((a, b) => a.sort_order - b.sort_order);
    return {
      ...item,
      thumb_image_id: imgs[0]?.image_id ?? null,
    };
  });

  return NextResponse.json({ selections });
}

// POST /api/collections/:collectionId/selections — addSelections
// body: multipart/form-data { category_id, title, description?, images?, keywords?, link?, items?, is_ordered?, is_selectable? }
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { collectionId: idParam } = await params;
  const collectionId = parseInt(idParam, 10);

  if (isNaN(collectionId)) {
    return NextResponse.json({ error: "Invalid collection ID" }, { status: 400 });
  }

  const formData = await request.formData();
  const category_id = parseInt(formData.get("category_id") as string, 10);
  const title = formData.get("title") as string | null;
  const description = (formData.get("description") as string | null) ?? null;
  const keywordsRaw = formData.get("keywords") as string | null;
  const keywords = parseKeywordsJson(keywordsRaw);
  const link = (formData.get("link") as string | null) ?? null;
  const itemsRaw = formData.get("items") as string | null;
  const items = itemsRaw ? JSON.parse(itemsRaw) : null;
  const is_ordered = formData.get("is_ordered") === "true";
  const is_selectable = formData.get("is_selectable") !== "false";
  const imageFiles = formData.getAll("images") as File[];

  if (!category_id || !title) {
    return NextResponse.json(
      { error: "category_id and title are required" },
      { status: 400 }
    );
  }
  if (keywordsRaw === null) {
    return NextResponse.json({ error: "keywords is required" }, { status: 400 });
  }
  if (!keywords || keywords.length === 0) {
    return NextResponse.json(
      { error: "keywords must be a non-empty JSON array of strings" },
      { status: 400 }
    );
  }

  let keywordEntries;
  try {
    keywordEntries = await ensureKeywordsInCategory(category_id, keywords);
  } catch (err) {
    console.error("Failed to save keywords:", err);
    return NextResponse.json({ error: "Failed to save keywords" }, { status: 500 });
  }

  const { data: newSelection, error } = await getSupabase()
    .from("selections")
    .insert({
      category_id,
      owner_id: auth.userId,
      user_id: auth.userId,
      collection_id: collectionId,
      selection_id: null,
      title,
      description,
      keywords: keywordEntries,
      link,
      items,
      is_ordered,
      is_selectable,
    })
    .select("collection_id, selection_id")
    .single();

  if (error || !newSelection) {
    console.error("addSelections error:", error);
    return NextResponse.json({ error: "Failed to create selection" }, { status: 500 });
  }

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
        collection_id: newSelection.collection_id,
        selection_id: newSelection.selection_id,
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

  return NextResponse.json({ success: true }, { status: 201 });
}
