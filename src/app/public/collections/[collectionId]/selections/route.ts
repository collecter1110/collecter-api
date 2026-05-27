import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import {
  publicResponse,
  publicError,
  serializeSelectionListItem,
} from "@/lib/publicResponse";
import {
  getSelectionHomeMap,
  isSelectionVisibleToViewer,
} from "@/lib/selectionVisibility";

/**
 * @openapi
 * /public/collections/{collectionId}/selections:
 *   get:
 *     tags: [Public]
 *     summary: 공개 컬렉션의 셀렉션 목록 (비로그인)
 *     description: |
 *       부모 컬렉션이 공개일 때만 노출. 원작 홈 컬렉션이 비공개인 셀렉션은 숨김.
 *     security: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: |
 *           셀렉션 목록.
 *           404 응답의 `errorCode` 로 사유 구분:
 *           - `SU001`: 존재하지 않음
 *           - `SU002`: 비공개 컬렉션
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     selections:
 *                       - id: 789
 *                         collection_id: 123
 *                         category_id: 1
 *                         selection_title: 내 셀렉션
 *                         keywords: []
 *                         owner_name: gimgahui
 *                         image_url: "https://image.collecter.kr/abc.jpg"
 *       404:
 *         description: 컬렉션을 찾을 수 없음 (비공개 포함)
 */

type Params = { params: Promise<{ collectionId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { collectionId: idParam } = await params;
  const collectionId = parseInt(idParam, 10);
  if (isNaN(collectionId)) {
    return publicError("Invalid collection ID", 400);
  }

  const { data: collection, error: colErr } = await getSupabase()
    .from("collections")
    .select("is_public")
    .eq("id", collectionId)
    .single();

  if (colErr || !collection) {
    return publicError("Collection not found", 404, "SU001");
  }
  if (!collection.is_public) {
    return publicError("Collection is private", 404, "SU002");
  }

  const { data, error } = await getSupabase()
    .from("collection_selections")
    .select(
      `collection_id, selections(
        id, category_id, title, keywords, owner_name,
        selection_images(image_id, sort_order)
      )`
    )
    .eq("collection_id", collectionId);

  if (error) {
    console.error("public getSelections error:", error);
    return publicError("Failed to fetch selections", 500);
  }

  type CSRow = {
    collection_id: number;
    selections: {
      id: number;
      category_id: number;
      title: string;
      keywords: unknown;
      owner_name: string;
      selection_images: { image_id: string; sort_order: number }[];
    };
  };

  const csRows = (data ?? []) as unknown as CSRow[];

  // 원작 홈 컬렉션이 비공개인 셀렉션은 숨김 (viewer = null)
  let visibleRows = csRows;
  if (csRows.length > 0) {
    const homeMap = await getSelectionHomeMap(csRows.map((r) => r.selections.id));
    visibleRows = csRows.filter((row) =>
      isSelectionVisibleToViewer(homeMap.get(row.selections.id), null)
    );
  }

  const selections = visibleRows.map((row) =>
    serializeSelectionListItem(row.selections, row.collection_id)
  );

  return publicResponse({ selections });
}
