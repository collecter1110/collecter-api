/**
 * DB `collections` 행 → API 목록/임베드 응답
 * (`id`·`title`는 노출하지 않고 `collection_id`·`collection_title`로 통일)
 */
export function mapCollectionListRowToApi<
  T extends { id: number; title: string | null },
>(row: T): Omit<T, "id" | "title"> & {
  collection_id: number;
  collection_title: string | null;
} {
  const { id, title, ...rest } = row;
  return { ...rest, collection_id: id, collection_title: title };
}
