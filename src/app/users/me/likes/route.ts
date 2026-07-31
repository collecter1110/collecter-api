import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";
import { mapCollectionListRowToApi } from "@/lib/collectionResponse";
import { getUserImageMap } from "@/lib/userInfo";

/**
 * @openapi
 * /users/me/likes:
 *   get:
 *     tags: [Users]
 *     summary: 내가 좋아요한 컬렉션 목록
 *     description: |
 *       차단한 유저의 컬렉션과 남의 비공개 컬렉션은 제외됩니다.
 *       내가 만든 컬렉션은 비공개여도 포함됩니다.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 좋아요한 컬렉션 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [collections]
 *               properties:
 *                 collections:
 *                   type: array
 *                   items:
 *                     type: object
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     collections:
 *                       - collection_id: 123
 *                         category_id: 1
 *                         collection_title: 좋아요한 컬렉션
 *                         image_id: "b7c6f3b0-6a0f-4b4a-9a90-2c02e4a2b9a1"
 *                         user_id: 99
 *                         user_name: otheruser
 *                         user_image_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                         selection_num: 8
 *                         is_public: true
 *               empty:
 *                 summary: 좋아요한 컬렉션 없음
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     collections: []
 *       401:
 *         description: 인증 필요
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Unauthorized
 *                   data: {}
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to fetch liked collections
 *                   data: {}
 */
// GET /users/me/likes — getLikeCollections
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  // 좋아요 목록과 차단 목록 조회를 병렬 실행
  const [{ data, error }, blockedIds] = await Promise.all([
    getSupabase()
      .from("likes")
      .select(
        "collections(id, category_id, title, image_id, user_id, user_name, selection_num, is_public)"
      )
      .eq("user_id", auth.userId),
    getBlockedUserIds(auth.userId),
  ]);

  if (error) {
    console.error("getLikeCollections error:", error);
    return apiError("Failed to fetch liked collections", 500);
  }

  const mapped = (data ?? [])
    .map((item) => {
      let raw: unknown = item.collections;
      if (raw == null) return null;
      if (Array.isArray(raw)) raw = raw[0];
      if (!raw || typeof raw !== "object" || !("id" in raw)) return null;
      return mapCollectionListRowToApi(
        raw as { id: number; title: string | null } & Record<string, unknown>
      );
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .filter(
      (c) =>
        c.user_id === auth.userId ||
        (c as Record<string, unknown>).is_public !== false
    )
    .filter((c) =>
      blockedIds.length === 0 || !blockedIds.includes(c.user_id as number)
    );

  // 작성자 프로필 이미지 조회 (userinfo.image_id)
  const userImageMap = await getUserImageMap(
    mapped.map((c) => c.user_id as number)
  );

  const collections = mapped.map((c) => ({
    ...c,
    user_image_id: userImageMap.get(c.user_id as number) ?? null,
  }));

  return apiResponse({ collections });
}
