import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

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
 *                       - created_date: "2026-04-15"
 *                         selections:
 *                           - created_time: "16:31:27"
 *                             selection_name: "일인칭 단수"
 *                             user_name: "iris3455"
 *                             image_id: null
 *                             owner_name: "siriya"
 *                             owner_id: 69
 *                             id: 789
 *                             collection_id: 636
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
       selections_v2!inner(id, title, owner_id, owner_name,
         selection_images(image_id, sort_order)
       )`
    )
    .eq("selections_v2.owner_id", auth.userId)
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
    selections_v2: {
      id: number;
      title: string;
      owner_id: number;
      owner_name: string;
      selection_images: { image_id: string; sort_order: number }[];
    };
  };

  const rows = (data ?? []) as unknown as CSRow[];

  // 퍼간 유저 이름 조회
  const selectingUserIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: users } = await getSupabase()
    .from("userinfo")
    .select("user_id, name")
    .in("user_id", selectingUserIds);

  const userMap = new Map<number, string>();
  for (const u of users ?? []) {
    userMap.set(u.user_id, u.name);
  }

  // 날짜별 그룹핑
  const grouped = new Map<string, Array<Record<string, unknown>>>();

  for (const row of rows) {
    const sel = row.selections_v2;
    const createdAt = new Date(row.created_at);
    const dateStr = createdAt.toISOString().slice(0, 10);
    const timeStr = createdAt.toTimeString().slice(0, 8);

    const imgs = [...sel.selection_images].sort((a, b) => a.sort_order - b.sort_order);

    const item = {
      created_time: timeStr,
      selection_name: sel.title,
      user_name: userMap.get(row.user_id) ?? "",
      image_id: imgs[0]?.image_id ?? null,
      owner_name: sel.owner_name,
      owner_id: sel.owner_id,
      id: sel.id,
      collection_id: row.collection_id,
    };

    if (!grouped.has(dateStr)) {
      grouped.set(dateStr, []);
    }
    grouped.get(dateStr)!.push(item);
  }

  const selected = Array.from(grouped.entries()).map(([date, selections]) => ({
    created_date: date,
    selections,
  }));

  return apiResponse({ selected });
}
