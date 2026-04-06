import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { uploadImageAndSave, deleteImageById } from "@/lib/storage";
import {
  ensureCollectionCoverIfEmpty,
  repairCollectionCoverIfUsingDeletedImage,
} from "@/lib/collectionCover";
import { ensureKeywordsInCategory, parseKeywordsJson } from "@/lib/keywords";

type Params = { params: Promise<{ collectionId: string; selectionId: string }> };

// GET /api/collections/:collectionId/selections/:selectionId — getSelectionDetail
export async function GET(_request: NextRequest, { params }: Params) {
  const { collectionId: cIdParam, selectionId: sIdParam } = await params;
  const collectionId = parseInt(cIdParam, 10);
  const selectionId = parseInt(sIdParam, 10);

  if (isNaN(collectionId) || isNaN(selectionId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const { data, error } = await getSupabase()
    .from("selections")
    .select(
      `category_id, collection_id, selection_id, user_id, owner_id, title, description,
       is_ordered, link, items, keywords, created_at, owner_name, is_selectable, is_selecting,
       selection_images(image_id, sort_order, images(file_path))`
    )
    .eq("collection_id", collectionId)
    .eq("selection_id", selectionId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Selection not found" }, { status: 404 });
    }
    console.error("getSelectionDetail error:", error);
    return NextResponse.json({ error: "Failed to fetch selection" }, { status: 500 });
  }

  return NextResponse.json({ selection: data });
}

// PATCH /api/collections/:collectionId/selections/:selectionId — editSelection
// body: multipart/form-data { ..fields.., images?(new files), keep_image_ids?(JSON string) }
// keep_image_ids: 유지할 기존 image_id 배열. 없으면 이미지 변경 안함. 빈 배열이면 전체 삭제.
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { collectionId: cIdParam, selectionId: sIdParam } = await params;
  const collectionId = parseInt(cIdParam, 10);
  const selectionId = parseInt(sIdParam, 10);

  if (isNaN(collectionId) || isNaN(selectionId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
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
  if (keywordsRaw !== null) {
    const parsed = parseKeywordsJson(keywordsRaw);
    if (!parsed || parsed.length === 0) {
      return NextResponse.json(
        { error: "keywords must be a non-empty JSON array of strings" },
        { status: 400 }
      );
    }
    updates.keywords = parsed;
  }
  if (linkRaw !== null) updates.link = linkRaw;
  if (itemsRaw !== null) updates.items = JSON.parse(itemsRaw);
  if (is_orderedRaw !== null) updates.is_ordered = is_orderedRaw === "true";
  if (is_selectableRaw !== null) updates.is_selectable = is_selectableRaw !== "false";

  if (keywordsRaw === null) {
    return NextResponse.json({ error: "keywords is required" }, { status: 400 });
  }

  // 키워드를 keywordinfo에 저장 (category_id는 요청값 우선, 없으면 기존 셀렉션 값 사용)
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

    const keywordsForSave = updates.keywords as string[] | undefined;
    if (!categoryIdForKeywords) {
      return NextResponse.json({ error: "Selection not found" }, { status: 404 });
    }
    if (keywordsForSave) {
      await ensureKeywordsInCategory(categoryIdForKeywords, keywordsForSave);
    }
  } catch (err) {
    console.error("Failed to save keywords:", err);
    return NextResponse.json({ error: "Failed to save keywords" }, { status: 500 });
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await getSupabase()
      .from("selections")
      .update(updates)
      .eq("collection_id", collectionId)
      .eq("selection_id", selectionId);

    if (error) {
      console.error("editSelection error:", error);
      return NextResponse.json({ error: "Failed to update selection" }, { status: 500 });
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

  return NextResponse.json({ success: true });
}

// DELETE /api/collections/:collectionId/selections/:selectionId — deleteSelection
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { collectionId: cIdParam, selectionId: sIdParam } = await params;
  const collectionId = parseInt(cIdParam, 10);
  const selectionId = parseInt(sIdParam, 10);

  if (isNaN(collectionId) || isNaN(selectionId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
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
    return NextResponse.json({ error: "Failed to delete selection" }, { status: 500 });
  }

  // 커버가 방금 지운 이미지였으면 다른 셀렉션 이미지로 복구
  await repairCollectionCoverIfUsingDeletedImage(collectionId, deletedIds);

  return NextResponse.json({ success: true });
}
