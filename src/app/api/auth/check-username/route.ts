import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

/**
 * @openapi
 * /api/auth/check-username:
 *   get:
 *     tags: [Auth]
 *     summary: 유저네임 중복 확인
 *     description: "유저네임이 사용 가능한지 확인합니다. (success=true이면 사용 가능, success=false이면 이미 존재)"
 *     parameters:
 *       - in: query
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *         example: gimgahui
 *     responses:
 *       200:
 *         description: 중복 확인 결과
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success]
 *               properties:
 *                 success:
 *                   type: boolean
 *             examples:
 *               available:
 *                 summary: 사용 가능한 유저네임
 *                 value:
 *                   success: true
 *               taken:
 *                 summary: 이미 사용 중인 유저네임
 *                 value:
 *                   success: false
 *       400:
 *         description: username 파라미터 누락
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: username parameter is required
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: Server error
 */
// GET /api/auth/check-username?username=...
// success: true → 사용 가능
export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username");

  if (!username) {
    return NextResponse.json(
      { error: "username parameter is required" },
      { status: 400 }
    );
  }

  const { data, error } = await getSupabase()
    .from("userinfo")
    .select("name")
    .eq("name", username)
    .maybeSingle();

  if (error) {
    console.error("checkUserNameDuplicate error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  return NextResponse.json({ success: data === null });
}
