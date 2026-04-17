import { getSupabase } from "@/lib/supabase";

/**
 * 셀렉션의 "home" 정보.
 *
 * home = `collection_selections` 에서 `user_id == selections.owner_id` 인 row.
 * 원작자가 본인 셀렉션을 셀렉팅할 수 없다는 규칙 하에 유일함을 전제로 한다.
 */
export type SelectionHomeInfo = {
  homeCollectionId: number;
  isPublic: boolean;
  ownerId: number;
};

/**
 * 여러 selection_id 의 home 정보를 한 번에 조회.
 *
 * home 이 없으면 (레거시 데이터 등) 맵에 포함되지 않는다. 호출 측에서
 * `isSelectionVisibleToViewer` 로 판정할 때 undefined 는 안전하게 "보임"으로 처리된다.
 */
export async function getSelectionHomeMap(
  selectionIds: number[]
): Promise<Map<number, SelectionHomeInfo>> {
  const result = new Map<number, SelectionHomeInfo>();
  const unique = Array.from(new Set(selectionIds));
  if (unique.length === 0) return result;

  const { data, error } = await getSupabase()
    .from("collection_selections")
    .select(
      `collection_id, selection_id, user_id,
       selections!inner(owner_id),
       collections!inner(is_public)`
    )
    .in("selection_id", unique);

  if (error) {
    console.error("getSelectionHomeMap error:", error);
    return result;
  }

  type Row = {
    collection_id: number;
    selection_id: number;
    user_id: number;
    selections: { owner_id: number } | { owner_id: number }[];
    collections: { is_public: boolean } | { is_public: boolean }[];
  };

  const rows = (data ?? []) as unknown as Row[];

  for (const r of rows) {
    const sel = Array.isArray(r.selections) ? r.selections[0] : r.selections;
    const col = Array.isArray(r.collections) ? r.collections[0] : r.collections;
    if (!sel || !col) continue;
    if (r.user_id !== sel.owner_id) continue;
    result.set(r.selection_id, {
      homeCollectionId: r.collection_id,
      isPublic: col.is_public,
      ownerId: sel.owner_id,
    });
  }

  return result;
}

/**
 * 단일 selection 에 대한 home 정보 조회.
 */
export async function getSelectionHome(
  selectionId: number
): Promise<SelectionHomeInfo | null> {
  const map = await getSelectionHomeMap([selectionId]);
  return map.get(selectionId) ?? null;
}

/**
 * 뷰어가 해당 셀렉션을 볼 수 있는지 판정.
 *
 * - home 정보가 없으면 (레거시/이상치) 보이게 처리해서 기존 동작을 깨지 않는다.
 * - home 이 공개 컬렉션이면 누구에게나 보임.
 * - home 이 비공개면 원작자 본인에게만 보임. viewer 가 없거나(비로그인) 다르면 숨김.
 */
export function isSelectionVisibleToViewer(
  home: SelectionHomeInfo | undefined | null,
  viewerUserId: number | null
): boolean {
  if (!home) return true;
  if (home.isPublic) return true;
  return viewerUserId !== null && viewerUserId === home.ownerId;
}
