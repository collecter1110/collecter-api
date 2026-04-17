import { getSupabase } from "@/lib/supabase";

export async function recalcCollectionSelectionNum(
  collectionId: number
): Promise<void> {
  const supabase = getSupabase();

  const { count, error: countError } = await supabase
    .from("collection_selections")
    .select("*", { count: "exact", head: true })
    .eq("collection_id", collectionId);

  if (countError) {
    console.error("recalcCollectionSelectionNum count error:", countError);
    return;
  }

  const { error: updateError } = await supabase
    .from("collections")
    .update({ selection_num: count ?? 0 })
    .eq("id", collectionId);

  if (updateError) {
    console.error("recalcCollectionSelectionNum update error:", updateError);
  }
}

export async function recalcCollectionSelectionNums(
  collectionIds: number[]
): Promise<void> {
  const unique = Array.from(new Set(collectionIds));
  await Promise.all(unique.map((id) => recalcCollectionSelectionNum(id)));
}
