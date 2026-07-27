import { NextRequest, NextResponse } from "next/server";
import { apiResponse, apiError } from "@/lib/apiResponse";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { getUserName } from "@/lib/userInfo";

/**
 * @openapi
 * /collections:
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
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     success: true
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: category_id and title are required
 *                   data: {}
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
 *                   msg: Failed to create collection
 *                   data: {}
 */
// POST /collections — addCollection
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

  if (isNaN(category_id) || !title) {
    return apiError("category_id and title are required", 400);
  }

  // 커버 이미지는 셀렉션 이미지(image_id)를 재사용하도록 서버에서 자동 설정합니다.
  // 컬렉션 생성 시에는 비워두고, 셀렉션 업로드/수정 과정에서 채워집니다.
  const image_id: string | null = null;

  // auth.name은 토큰 발급 시점 스냅샷이라 개명 이후 어긋날 수 있으므로 DB에서 읽는다.
  const userName = await getUserName(auth.userId);
  if (!userName) {
    console.error("addCollection error: user name not found", auth.userId);
    return apiError("Failed to create collection", 500);
  }

  const { error } = await getSupabase().from("collections").insert({
    category_id,
    user_id: auth.userId,
    user_name: userName,
    title,
    description,
    tags,
    is_public,
    image_id,
  });

  if (error) {
    console.error("addCollection error:", error);
    return apiError("Failed to create collection", 500);
  }

  return apiResponse({ success: true }, 201);
}
