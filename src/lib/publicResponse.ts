import { NextResponse } from "next/server";
import { buildImageUrl } from "@/lib/storage";

const DEFAULT_CACHE = "public, max-age=60, s-maxage=300, stale-while-revalidate=3600";

export function publicResponse(
  data: Record<string, unknown> = {},
  status = 200,
  cacheControl: string = DEFAULT_CACHE
) {
  return NextResponse.json(
    { errorCode: "SU000", msg: "ok", data },
    { status, headers: { "Cache-Control": cacheControl } }
  );
}

export function publicError(msg: string, status = 404, errorCode = "SU000") {
  return NextResponse.json(
    { errorCode, msg, data: {} },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

/** PostgREST의 to-one 임베드는 객체로 오지만, 관계 추론에 따라 배열로 올 때가 있다. */
function embedOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

type CollectionRow = {
  id: number;
  category_id: number;
  title: string;
  description: string | null;
  created_at: string;
  image_id: string | null;
  tags: unknown;
  user_name: string;
  primary_keywords: unknown;
  selection_num: number;
  like_num: number;
  categoryinfo?: { category_name: string } | { category_name: string }[] | null;
  userinfo?: { image_id: string | null } | { image_id: string | null }[] | null;
};

export function serializeCollection(row: CollectionRow) {
  return {
    collection_id: row.id,
    category_id: row.category_id,
    category_name: embedOne(row.categoryinfo)?.category_name ?? null,
    collection_title: row.title,
    description: row.description,
    image_url: buildImageUrl(row.image_id),
    tags: row.tags,
    owner_name: row.user_name,
    owner_image_url: buildImageUrl(embedOne(row.userinfo)?.image_id),
    primary_keywords: row.primary_keywords,
    selection_num: row.selection_num,
    like_num: row.like_num,
    created_at: row.created_at,
  };
}

type SelectionListRow = {
  id: number;
  category_id: number;
  title: string;
  keywords: unknown;
  owner_name: string;
  selection_images: { image_id: string; sort_order: number }[];
};

export function serializeSelectionListItem(
  row: SelectionListRow,
  collectionId: number
) {
  const imgs = [...row.selection_images].sort((a, b) => a.sort_order - b.sort_order);
  return {
    id: row.id,
    collection_id: collectionId,
    category_id: row.category_id,
    selection_title: row.title,
    keywords: row.keywords,
    owner_name: row.owner_name,
    image_url: buildImageUrl(imgs[0]?.image_id ?? null),
  };
}

type SelectionDetailRow = {
  id: number;
  category_id: number;
  title: string;
  description: string | null;
  is_ordered: boolean;
  link: string | null;
  items: unknown;
  keywords: unknown;
  created_at: string;
  owner_name: string;
  is_selectable: boolean;
  selection_images: { image_id: string; sort_order: number }[];
  categoryinfo?: { category_name: string } | { category_name: string }[] | null;
  userinfo?: { image_id: string | null } | { image_id: string | null }[] | null;
};

export function serializeSelectionDetail(
  row: SelectionDetailRow,
  collectionId: number
) {
  const images = [...row.selection_images]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => ({
      image_url: buildImageUrl(i.image_id),
      sort_order: i.sort_order,
    }));

  return {
    id: row.id,
    collection_id: collectionId,
    category_id: row.category_id,
    category_name: embedOne(row.categoryinfo)?.category_name ?? null,
    selection_title: row.title,
    description: row.description,
    is_ordered: row.is_ordered,
    link: row.link,
    items: row.items,
    keywords: row.keywords,
    created_at: row.created_at,
    owner_name: row.owner_name,
    owner_image_url: buildImageUrl(embedOne(row.userinfo)?.image_id),
    is_selectable: row.is_selectable,
    selection_images: images,
  };
}
