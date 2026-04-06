import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

/**
 * @openapi
 * /api/collections:
 *   post:
 *     tags:
 *       - Collections
 *     summary: 컬렉션 생성
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - category_id
 *               - title
 *             properties:
 *               category_id:
 *                 type: integer
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               tags:
 *                 type: string
 *                 description: JSON 배열 문자열
 *               is_public:
 *                 type: string
 *                 description: 비공개이면 "false"
 *     responses:
 *       201:
 *         description: 생성됨
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
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: category_id and title are required
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
 *                   error: Failed to create collection
 */
// POST /api/collections — addCollection
// body: multipart/form-data { category_id, title, description?, tags?, is_public? }
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const formData = await request.formData();
  const category_id = parseInt(formData.get("category_id") as string, 10);
  const title = formData.get("title") as string | null;
  const description = (formData.get("description") as string | null) ?? null;
  const tagsRaw = formData.get("tags") as string | null;
  const tags = tagsRaw ? JSON.parse(tagsRaw) : null;
  const is_publicRaw = formData.get("is_public") as string | null;
  const is_public = is_publicRaw !== null ? is_publicRaw !== "false" : true;

  if (!category_id || !title) {
    return NextResponse.json(
      { error: "category_id and title are required" },
      { status: 400 }
    );
  }

  // 커버 이미지는 셀렉션 이미지(image_id)를 재사용하도록 서버에서 자동 설정합니다.
  // 컬렉션 생성 시에는 비워두고, 셀렉션 업로드/수정 과정에서 채워집니다.
  const image_id: string | null = null;

  const { error } = await getSupabase().from("collections").insert({
    category_id,
    user_id: auth.userId,
    title,
    description,
    tags,
    is_public,
    image_id,
  });

  if (error) {
    console.error("addCollection error:", error);
    return NextResponse.json(
      { error: "Failed to create collection" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
