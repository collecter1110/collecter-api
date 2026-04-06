import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/blocks";

/**
 * @openapi
 * /api/users/search:
 *   get:
 *     tags: [Users]
 *     summary: 유저 검색
 *     description: |
 *       유저네임으로 유저를 검색합니다. Full-text search를 사용합니다.
 *       Authorization 헤더가 있으면 본인 계정과 차단한 유저를 제외합니다.
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         example: gimgahui
 *       - in: header
 *         name: Authorization
 *         required: false
 *         schema:
 *           type: string
 *         description: Bearer access token (optional)
 *         example: Bearer eyJhbGciOi...
 *     responses:
 *       200:
 *         description: 검색된 유저 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [users]
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/SearchUser"
 *             examples:
 *               ok:
 *                 value:
 *                   users:
 *                     - user_id: 45
 *                       name: gimgahui
 *                       description: 안녕하세요
 *                       image_file_path: "https://cdn.example.com/users/profile.jpg"
 *                       image_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *               empty:
 *                 summary: 검색 결과 없음
 *                 value:
 *                   users: []
 *       400:
 *         description: q 파라미터 누락
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: "Query parameter 'q' is required"
 *       500:
 *         description: 검색 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: Failed to search users
 */
// GET /api/users/search?q=... — searchUsers
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");

  if (!q || q.trim() === "") {
    return NextResponse.json(
      { error: "Query parameter 'q' is required" },
      { status: 400 }
    );
  }

  const auth = await getAuthContext(request);
  const blockedIds = auth ? await getBlockedUserIds(auth.userId) : [];

  let query = getSupabase()
    .from("userinfo")
    .select("user_id, name, description, image_file_path, image_id")
    .textSearch("name", q.trim(), { type: "plain", config: "simple" })
    .is("deleted_at", null);

  if (auth) {
    query = query.neq("user_id", auth.userId);
  }
  if (blockedIds.length > 0) {
    query = query.not("user_id", "in", `(${blockedIds.join(",")})`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("searchUsers error:", error);
    return NextResponse.json({ error: "Failed to search users" }, { status: 500 });
  }

  return NextResponse.json({ users: data ?? [] });
}
