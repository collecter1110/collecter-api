import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";
import {
  getSelectionHomeMap,
  isSelectionVisibleToViewer,
} from "@/lib/selectionVisibility";

/**
 * @openapi
 * /selections/ranking:
 *   get:
 *     tags: [Selections]
 *     summary: Get ranking selections
 *     description: |
 *       public 컬렉션에 매핑된 셀렉션을 category_id별 상위 3개씩 반환합니다.
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: false
 *         schema:
 *           type: string
 *         description: Bearer access token (optional)
 *         example: Bearer eyJhbGciOi...
 *     responses:
 *       200:
 *         description: Ranking selections
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [selections]
 *               properties:
 *                 selections:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/RankingSelection"
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     selections:
 *                       - id: 456
 *                         collection_id: 123
 *                         selection_title: My selection
 *                         image_id: "7c2c8fb0-4d1b-4bd1-9e2c-9a0c5d6d2d3a"
 *                         keywords:
 *                           - keyword_id: 7
 *                             keyword_name: "키워드"
 *       500:
 *         description: Failed to fetch ranking selections
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to fetch ranking selections
 *                   data: {}
 */
// GET /selections/ranking — getRankingSelections
// 이미지 있는 셀렉션을 셀렉팅 수 → 최신순으로 최대 20개
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  const blockedIds = auth ? await getBlockedUserIds(auth.userId) : [];

  const { data, error } = await getSupabase()
    .from("selections")
    .select(
      `id, title, keywords, owner_id, created_at,
       selection_images!inner(image_id, sort_order),
       collection_selections(count)`
    )
    .order("id", { ascending: false });

  if (error) {
    console.error("getRankingSelections error:", error);
    return apiError("Failed to fetch ranking selections", 500);
  }

  type SelectionRow = {
    id: number;
    title: string;
    keywords: unknown;
    owner_id: number;
    created_at: string;
    selection_images: { image_id: string; sort_order: number }[];
    collection_selections: { count: number }[];
  };

  let rows = (data ?? []) as unknown as SelectionRow[];

  if (auth) {
    rows = rows.filter((r) => r.owner_id !== auth.userId);
  }
  if (blockedIds.length > 0) {
    rows = rows.filter((r) => !blockedIds.includes(r.owner_id));
  }

  let homeMap = new Map<number, import("@/lib/selectionVisibility").SelectionHomeInfo>();
  if (rows.length > 0) {
    homeMap = await getSelectionHomeMap(rows.map((r) => r.id));
    rows = rows.filter((r) =>
      isSelectionVisibleToViewer(homeMap.get(r.id), auth?.userId ?? null)
    );
  }

  const selections = rows
    .map((r) => ({
      ...r,
      selecting_count: r.collection_selections[0]?.count ?? 0,
    }))
    .sort((a, b) => {
      if (b.id !== a.id) return b.id - a.id;
      return b.selecting_count - a.selecting_count;
    })
    .slice(0, 20)
    .map((r) => {
      const thumb = [...r.selection_images].sort((a, b) => a.sort_order - b.sort_order)[0];
      return {
        id: r.id,
        collection_id: homeMap.get(r.id)?.homeCollectionId ?? null,
        selection_title: r.title,
        image_id: thumb?.image_id ?? null,
        keywords: r.keywords,
      };
    });

  return apiResponse({ selections });
}
