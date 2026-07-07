import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import {
  publicResponse,
  publicError,
  serializeSelectionDetail,
} from "@/lib/publicResponse";
import {
  getSelectionHome,
  isSelectionVisibleToViewer,
} from "@/lib/selectionVisibility";

/**
 * @openapi
 * /public/collections/{collectionId}/selections/{sid}:
 *   get:
 *     tags: [Public]
 *     summary: 공개 셀렉션 상세 (비로그인)
 *     description: |
 *       부모 컬렉션이 공개이고, 해당 컬렉션에 실제로 매핑된 셀렉션일 때만 노출.
 *       원작 홈 컬렉션이 비공개이면 숨김.
 *     security: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: sid
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: |
 *           셀렉션 상세.
 *           404 응답의 `errorCode` 로 사유 구분:
 *           - `SU001`: 존재하지 않음/미매핑 (컬렉션 삭제, 셀렉션 삭제, 또는 이 컬렉션에 속하지 않음)
 *           - `SU002`: 비공개 (부모 컬렉션 또는 원작 홈 컬렉션이 비공개)
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     selection:
 *                       id: 789
 *                       collection_id: 123
 *                       category_id: 1
 *                       selection_title: 내 셀렉션
 *                       description: 설명
 *                       is_ordered: false
 *                       link: null
 *                       items: null
 *                       keywords: []
 *                       created_at: "2026-04-06T12:34:56.000Z"
 *                       owner_name: gimgahui
 *                       is_selectable: true
 *                       selection_images:
 *                         - image_url: "https://image.collecter.kr/abc.jpg"
 *                           sort_order: 0
 *       404:
 *         description: 셀렉션 또는 컬렉션을 찾을 수 없음 (비공개/미매핑 포함)
 */

type Params = { params: Promise<{ collectionId: string; sid: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { collectionId: cidParam, sid: sidParam } = await params;
  const collectionId = parseInt(cidParam, 10);
  const sid = parseInt(sidParam, 10);
  if (isNaN(collectionId) || isNaN(sid)) {
    return publicError("Invalid ID", 400);
  }

  // 독립적인 조회 4개를 병렬 실행 (검사 순서는 기존과 동일하게 유지)
  const [
    { data: collection, error: colErr },
    { data: mapping },
    home,
    { data, error },
  ] = await Promise.all([
    getSupabase()
      .from("collections")
      .select("is_public")
      .eq("id", collectionId)
      .single(),
    // 부모 컬렉션에 실제로 매핑된 셀렉션인지 확인 (URL 위조 방지)
    getSupabase()
      .from("collection_selections")
      .select("selection_id")
      .eq("collection_id", collectionId)
      .eq("selection_id", sid)
      .maybeSingle(),
    // 원작 홈 컬렉션 비공개 체크용 정보
    getSelectionHome(sid),
    getSupabase()
      .from("selections")
      .select(
        `id, category_id, title, description,
         is_ordered, link, items, keywords, created_at, owner_name, is_selectable,
         selection_images(image_id, sort_order)`
      )
      .eq("id", sid)
      .single(),
  ]);

  if (colErr || !collection) {
    return publicError("Selection not found", 404, "SU001");
  }
  if (!collection.is_public) {
    return publicError("Parent collection is private", 404, "SU002");
  }

  if (!mapping) {
    return publicError("Selection not found", 404, "SU001");
  }

  if (!isSelectionVisibleToViewer(home, null)) {
    return publicError("Home collection is private", 404, "SU002");
  }

  if (error) {
    if (error.code === "PGRST116") {
      return publicError("Selection not found", 404, "SU001");
    }
    console.error("public getSelectionDetail error:", error);
    return publicError("Failed to fetch selection", 500);
  }

  return publicResponse({
    selection: serializeSelectionDetail(data, collectionId),
  });
}
