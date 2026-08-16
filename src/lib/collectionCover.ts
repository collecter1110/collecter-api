import { getSupabase } from "@/lib/supabase";

async function getFirstActiveImageIdForCollection(
  collectionId: number
): Promise<string | null> {
  // collection_selections를 통해 해당 컬렉션에 매핑된 셀렉션의 이미지를 조회
  const { data, error } = await getSupabase()
    .from("collection_selections")
    .select("selection_id")
    .eq("collection_id", collectionId);

  if (error || !data || data.length === 0) return null;

  const selectionIds = data.map((r) => r.selection_id);

  const { data: imgData, error: imgError } = await getSupabase()
    .from("selection_images")
    .select("image_id, created_at, sort_order, selection_id, images(deleted_at)")
    .in("selection_id", selectionIds)
    .order("created_at", { ascending: true })
    .order("sort_order", { ascending: true });

  if (imgError) return null;

  for (const row of imgData ?? []) {
    const images = (row as unknown as { images: { deleted_at: string | null }[] }).images;
    const deletedAt = images?.[0]?.deleted_at ?? null;
    if (!deletedAt) return (row as { image_id: string }).image_id;
  }
  return null;
}

export async function ensureCollectionCoverIfEmpty(
  collectionId: number,
  candidateImageId: string
): Promise<void> {
  const { data, error } = await getSupabase()
    .from("collections")
    .select("image_id")
    .eq("id", collectionId)
    .single();

  if (error) return;
  if (data?.image_id) return;

  await getSupabase()
    .from("collections")
    .update({ image_id: candidateImageId })
    .eq("id", collectionId);
}

/**
 * 커버가 `unavailableImageIds` 중 하나를 쓰고 있으면 남은 셀렉션 기준으로 다시 고른다.
 * 쓸 수 있는 이미지가 없으면 커버를 비운다(null).
 *
 * "삭제된 이미지"뿐 아니라 **이 컬렉션에서 빠져나간 이미지**(셀렉션 이동·셀렉팅 취소)에도
 * 그대로 쓴다. 커버가 더 이상 이 컬렉션 것이 아니게 됐다는 점에서 처리가 동일하다.
 */
export async function repairCollectionCoverIfUsingDeletedImage(
  collectionId: number,
  deletedImageIds: string[]
): Promise<void> {
  if (deletedImageIds.length === 0) return;

  const { data, error } = await getSupabase()
    .from("collections")
    .select("image_id")
    .eq("id", collectionId)
    .single();

  if (error) return;
  const current = data?.image_id as string | null | undefined;
  if (!current) return;
  if (!deletedImageIds.includes(current)) return;

  const next = await getFirstActiveImageIdForCollection(collectionId);
  await getSupabase()
    .from("collections")
    .update({ image_id: next })
    .eq("id", collectionId);
}
