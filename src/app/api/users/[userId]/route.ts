import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { UserInfo } from "@/types/user";

/**
 * @openapi
 * /api/users/{userId}:
 *   get:
 *     tags: [Users]
 *     summary: 다른 유저 정보 조회
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 45
 *     responses:
 *       200:
 *         description: 유저 정보
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [user]
 *               properties:
 *                 user:
 *                   $ref: "#/components/schemas/OtherUserInfo"
 *             examples:
 *               ok:
 *                 value:
 *                   user:
 *                     user_id: 45
 *                     name: gimgahui
 *                     description: 안녕하세요
 *                     image_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *       404:
 *         description: 유저를 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: User not found
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: Failed to fetch user
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId: userIdParam } = await params;
  const userId = parseInt(userIdParam, 10);

  if (isNaN(userId)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  const { data, error } = await getSupabase()
    .from("userinfo")
    .select("user_id, name, description, image_id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.error("getOtherUserInfo error:", error);
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 500 }
    );
  }

  const user: UserInfo = data;

  return NextResponse.json({ user });
}
