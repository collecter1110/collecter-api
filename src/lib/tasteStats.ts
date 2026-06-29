import { getSupabase } from "@/lib/supabase";
import {
  getSelectionHomeMap,
  isSelectionVisibleToViewer,
} from "@/lib/selectionVisibility";

export interface TasteStats {
  collection_count: number;
  like_count: number;
  selecting_count: number;
  selected_count: number;
}

/**
 * 유저의 취향 통계(내 컬렉션 / 좋아요 / 셀렉팅 / 셀렉티드 수)를 집계한다.
 *
 * - collection_count: 내가 만든 컬렉션 수
 * - like_count: 내가 좋아요한 수
 * - selecting_count: 내가 셀렉팅한 수 (home 이 공개인 것만)
 * - selected_count: 내 셀렉션이 셀렉팅 당한 수 (home 이 공개인 것만)
 */
export async function getUserTasteStats(userId: number): Promise<TasteStats> {
  const supabase = getSupabase();

  const [collectionResult, likeResult, selectingRows, selectedRows] =
    await Promise.all([
      supabase
        .from("collections")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId),
      supabase
        .from("likes")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId),
      // 내가 셀렉팅한 매핑: 내가 추가했지만 내가 owner가 아닌 것
      supabase
        .from("collection_selections")
        .select("selection_id, selections!inner(owner_id)")
        .eq("user_id", userId)
        .neq("selections.owner_id", userId),
      // 셀렉팅 당한 매핑: 내가 owner인 셀렉션을 다른 유저가 추가한 것
      supabase
        .from("collection_selections")
        .select("selection_id, selections!inner(owner_id)")
        .eq("selections.owner_id", userId)
        .neq("user_id", userId),
    ]);

  const selectingSelIds = ((selectingRows.data ?? []) as { selection_id: number }[]).map(
    (r) => r.selection_id
  );
  const selectedSelIds = ((selectedRows.data ?? []) as { selection_id: number }[]).map(
    (r) => r.selection_id
  );

  // home(원본 컬렉션)이 비공개인 셀렉팅은 카운트에서 제외한다.
  const allIds = Array.from(new Set([...selectingSelIds, ...selectedSelIds]));
  const homeMap = allIds.length > 0 ? await getSelectionHomeMap(allIds) : new Map();

  const selecting_count = selectingSelIds.filter((sid) =>
    isSelectionVisibleToViewer(homeMap.get(sid), userId)
  ).length;

  const selected_count = selectedSelIds.filter((sid) => {
    const home = homeMap.get(sid);
    return !home || home.isPublic;
  }).length;

  return {
    collection_count: collectionResult.count ?? 0,
    like_count: likeResult.count ?? 0,
    selecting_count,
    selected_count,
  };
}
