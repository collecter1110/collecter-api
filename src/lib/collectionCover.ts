import { getSupabase } from "@/lib/supabase";

async function getFirstActiveImageIdForCollection(
  collectionId: number
): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from("selection_images")
    .select("image_id, created_at, sort_order, images(deleted_at)")
    .eq("collection_id", collectionId)
    .order("created_at", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) return null;

  for (const row of data ?? []) {
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

