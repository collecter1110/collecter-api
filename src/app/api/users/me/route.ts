import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { uploadImageAndSave, deleteImageById } from "@/lib/storage";

/**
 * @openapi
 * /api/users/me:
 *   get:
 *     tags: [Users]
 *     summary: 내 정보 조회
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 내 유저 정보
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [user]
 *               properties:
 *                 user:
 *                   $ref: "#/components/schemas/MyUserInfo"
 *             examples:
 *               ok:
 *                 value:
 *                   user:
 *                     user_id: 45
 *                     name: gimgahui
 *                     email: user@example.com
 *                     description: 안녕하세요
 *                     image_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *       401:
 *         description: 인증 필요
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: Unauthorized
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
 *   patch:
 *     tags: [Users]
 *     summary: 내 정보 수정
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: 수정 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success]
 *               properties:
 *                 success:
 *                   type: boolean
 *             examples:
 *               ok:
 *                 value:
 *                   success: true
 *       400:
 *         description: name 누락
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: name is required
 *       401:
 *         description: 인증 필요
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: Unauthorized
 *       500:
 *         description: 수정 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: Failed to update user
 */
// GET /api/users/me — getUserInfo
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await getSupabase()
    .from("userinfo")
    .select("user_id, name, email, description, image_id")
    .eq("user_id", auth.userId)
    .single();

  if (error) {
    console.error("getUserInfo error:", error);
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
  }

  return NextResponse.json({ user: data });
}

// PATCH /api/users/me — editUserInfo
// body: multipart/form-data { name, description?, image? }
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const formData = await request.formData();
  const name = formData.get("name") as string | null;
  const description = formData.get("description") as string | null;
  const imageFile = formData.get("image") as File | null;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    name,
    description: description ?? null,
  };

  if (imageFile && imageFile.size > 0) {
    const { data: old } = await getSupabase()
      .from("userinfo")
      .select("image_id")
      .eq("user_id", auth.userId)
      .single();

    if (old?.image_id) {
      await deleteImageById(old.image_id);
    }

    try {
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      const { imageId } = await uploadImageAndSave(
        buffer,
        imageFile.type
      );
      updates.image_id = imageId;
    } catch {
      return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
    }
  }

  const { error } = await getSupabase()
    .from("userinfo")
    .update(updates)
    .eq("user_id", auth.userId);

  if (error) {
    console.error("editUserInfo error:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
