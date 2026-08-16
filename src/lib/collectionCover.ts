import { getSupabase } from "@/lib/supabase";

/**
 * 컬렉션 커버의 유일한 규칙:
 *
 *   커버 = 그 컬렉션에 속한 셀렉션의 살아있는 이미지 중 하나.
 *
 * 커버는 selection_num·primary_keywords와 같은 파생 데이터라서, 소속 셀렉션이나
 * 그 이미지가 바뀌면 다시 계산해야 한다. 예전에는 "비었으면 채우기"와 "지워진
 * 이미지면 고치기"를 별도 함수로 나눠 뒀는데, 호출하는 쪽이 상황을 구분하고
 * 어떤 image_id가 빠졌는지까지 넘겨야 해서 빠뜨리기 쉬웠다. 실제로 셀렉션 이동
 * 경로에서 통째로 누락돼, 컬렉션이 이미 나간 셀렉션의 이미지를 커버로 물고 있었다.
 *
 * 그래서 지금은 syncCollectionCover 하나로 통합한다. 언제 불러도, 몇 번을 불러도
 * 결과가 같다(idempotent).
 */

/**
 * 컬렉션에 속한 셀렉션들의 이미지를 표시 순서대로 반환한다.
 * 소프트 삭제된 이미지는 제외한다.
 */
async function getActiveImageIdsForCollection(
  collectionId: number
): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from("collection_selections")
    .select("selection_id")
    .eq("collection_id", collectionId);

  if (error || !data || data.length === 0) return [];

  const selectionIds = data.map((r) => r.selection_id);

  const { data: imgData, error: imgError } = await getSupabase()
    .from("selection_images")
    .select("image_id, created_at, sort_order, selection_id, images(deleted_at)")
    .in("selection_id", selectionIds)
    .order("created_at", { ascending: true })
    .order("sort_order", { ascending: true });

  if (imgError) return [];

  const active: string[] = [];
  for (const row of imgData ?? []) {
    const images = (row as unknown as { images: { deleted_at: string | null }[] }).images;
    const deletedAt = images?.[0]?.deleted_at ?? null;
    if (!deletedAt) active.push((row as { image_id: string }).image_id);
  }
  return active;
}


export async function syncCollectionCover(collectionId: number): Promise<void> {
  const { data, error } = await getSupabase()
    .from("collections")
    .select("image_id")
    .eq("id", collectionId)
    .single();

  if (error) return;

  const current = (data?.image_id as string | null | undefined) ?? null;
  const active = await getActiveImageIdsForCollection(collectionId);

  // 이미지가 하나도 없는데 커버도 이미 비어 있으면 할 일이 없다.
  // (조회 실패로 빈 배열이 온 경우에도 멀쩡한 커버를 지우지 않도록,
  //  커버가 있는데 후보가 없을 때만 비운다.)
  if (current !== null && active.includes(current)) return;

  const next = active[0] ?? null;
  if (next === current) return;

  await getSupabase()
    .from("collections")
    .update({ image_id: next })
    .eq("id", collectionId);
}

/** 여러 컬렉션의 커버를 한 번에 맞춘다. */
export async function syncCollectionCovers(
  collectionIds: Iterable<number>
): Promise<void> {
  for (const collectionId of new Set(collectionIds)) {
    await syncCollectionCover(collectionId);
  }
}
