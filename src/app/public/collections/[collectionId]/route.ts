import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import {
  publicResponse,
  publicError,
  serializeCollection,
} from "@/lib/publicResponse";

/**
 * @openapi
 * /public/collections/{collectionId}:
 *   get:
 *     tags: [Public]
 *     summary: 공개 컬렉션 상세 (비로그인)
 *     description: |
 *       공유 웹 페이지(share.collecter.kr)에서 사용. 인증 헤더는 무시되며,
 *       `is_public = true` 인 컬렉션만 노출된다. 비공개 컬렉션은 존재 여부 자체를 숨기기 위해 404.
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
 *           공개 컬렉션 메타.
 *           404 응답의 `errorCode` 로 사유 구분:
 *           - `SU001`: 존재하지 않음 (삭제됨/잘못된 ID)
 *           - `SU002`: 비공개 컬렉션
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     collection:
 *                       collection_id: 123
 *                       category_id: 1
 *                       collection_title: 내 컬렉션
 *                       description: 설명
 *                       image_url: "https://image.collecter.kr/abc.jpg"
 *                       tags: ["태그1"]
 *                       owner_name: gimgahui
 *                       primary_keywords: []
 *                       selection_num: 12
 *                       like_num: 34
 *                       created_at: "2026-04-06T12:34:56.000Z"
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

  const { data, error } = await getSupabase()
    .from("collections")
    .select(
      `id, category_id, title, description, created_at, image_id,
       tags, user_name, primary_keywords, selection_num, like_num, is_public`
    )
    .eq("id", collectionId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return publicError("Collection not found", 404, "SU001");
    }
    console.error("public getCollection error:", error);
    return publicError("Failed to fetch collection", 500);
  }

  if (!data.is_public) {
    return publicError("Collection is private", 404, "SU002");
  }

  return publicResponse({ collection: serializeCollection(data) });
}
