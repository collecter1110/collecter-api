import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import {
  getSelectionHomeMap,
  isSelectionVisibleToViewer,
} from "@/lib/selectionVisibility";

/**
 * @openapi
 * /selected:
 *   get:
 *     tags: [Selectings]
 *     summary: 셀렉팅 당한 목록 조회
 *     description: |
 *       `collection_selections` 테이블에서 다른 유저가 내 셀렉션을 퍼간(selected) 목록을 조회합니다.
 *       내가 owner인 셀렉션 중 다른 유저가 추가한 매핑을 조회합니다.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 셀렉팅 당한 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [selected]
 *               properties:
 *                 selected:
 *                   type: array
 *                   items:
 *                     type: object
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     selected:
 *                       - created_at: "2026-04-15T07:31:27.000Z"
 *                         selection_name: "일인칭 단수"
 *                         user_id: 70
 *                         user_name: "iris3455"
 *                         user_image_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                         image_id: null
 *                         owner_name: "siriya"
 *                         owner_id: 69
 *                         owner_image_id: "b2c3d4e5-f6a7-8901-bcde-f12345678901"
 *                         id: 789
 *                         collection_id: 636
 *               empty:
 *                 summary: 셀렉팅 당한 내역 없음
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     selected: []
 *       401:
 *         description: 인증 필요
 *       500:
 *         description: 서버 오류
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  // 내가 owner인 셀렉션을 다른 유저가 매핑한 것 = 셀렉팅 당한 것
  const { data, error } = await getSupabase()
    .from("collection_selections")
    .select(
      `collection_id, selection_id, user_id, created_at,
       selections!inner(id, title, owner_id, owner_name,
         selection_images(image_id, sort_order)
       )`
    )
    .eq("selections.owner_id", auth.userId)
    .neq("user_id", auth.userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getSelectedSelectings error:", error);
    return apiError("Failed to fetch selected selectings", 500);
  }

  if (!data || data.length === 0) {
    return apiResponse({ selected: [] });
  }

  type CSRow = {
    collection_id: number;
    selection_id: number;
    user_id: number;
    created_at: string;
    selections: {
      id: number;
      title: string;
      owner_id: number;
      owner_name: string;
      selection_images: { image_id: string; sort_order: number }[];
    };
  };

  let rows = (data ?? []) as unknown as CSRow[];

  // 원본(home) 컬렉션이 비공개인 셀렉션은 숨김.
  // 이 엔드포인트는 auth.userId == owner_id 조건으로 이미 필터되어 있어
  // home.isPublic=false 이어도 원작자 본인에게는 visible 로 판정된다.
  // 다만 일관된 동작을 위해 동일 유틸을 사용한다.
  if (rows.length > 0) {
    const homeMap = await getSelectionHomeMap(rows.map((r) => r.selection_id));
    rows = rows.filter((r) =>
      isSelectionVisibleToViewer(homeMap.get(r.selection_id), auth.userId)
    );
  }

  // 퍼간 유저 + owner 의 이름/프로필 이미지 조회
  // (owner_id 는 항상 auth.userId 지만 일관성을 위해 함께 조회)
  const lookupUserIds = [
    ...new Set([
      ...rows.map((r) => r.user_id),
      ...rows.map((r) => r.selections.owner_id),
    ]),
  ];
  const { data: users } = await getSupabase()
    .from("userinfo")
    .select("user_id, name, image_id")
    .in("user_id", lookupUserIds);

  const userMap = new Map<number, string>();
  const userImageMap = new Map<number, string | null>();
  for (const u of users ?? []) {
    userMap.set(u.user_id, u.name);
    userImageMap.set(u.user_id, (u.image_id as string | null) ?? null);
  }

  // rows 는 created_at 기준 내림차순 정렬되어 있다.
  // 날짜 그룹핑/시간 포맷은 클라이언트가 created_at(ISO, UTC)을 파싱해 처리한다.
  const selected = rows.map((row) => {
    const sel = row.selections;
    const imgs = [...sel.selection_images].sort((a, b) => a.sort_order - b.sort_order);

    return {
      created_at: row.created_at,
      selection_name: sel.title,
      user_id: row.user_id,
      user_name: userMap.get(row.user_id) ?? "",
      user_image_id: userImageMap.get(row.user_id) ?? null,
      image_id: imgs[0]?.image_id ?? null,
      owner_name: sel.owner_name,
      owner_id: sel.owner_id,
      owner_image_id: userImageMap.get(sel.owner_id) ?? null,
      id: sel.id,
      collection_id: row.collection_id,
    };
  });

  return apiResponse({ selected });
}
