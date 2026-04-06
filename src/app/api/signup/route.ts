import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { createRefreshSession, newSessionId } from "@/lib/authStore";
import { signAccessToken, signRefreshToken, verifyJwt, type VerifiedTokenClaims } from "@/lib/jwt";
import { uploadImageAndSave } from "@/lib/storage";

/**
 * @openapi
 * /api/signup:
 *   post:
 *     tags: [Auth]
 *     summary: 회원가입
 *     description: OTP 검증 후 발급된 `verified_token`으로 프로필을 설정하고 토큰을 발급합니다.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [verified_token, email, name]
 *             properties:
 *               verified_token:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: 회원가입 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [access_token, refresh_token]
 *               properties:
 *                 access_token:
 *                   type: string
 *                 refresh_token:
 *                   type: string
 *             examples:
 *               ok:
 *                 value:
 *                   access_token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXAiOiJhY2Nlc3MiLCJ1c2VyX2lkIjo0NiwiZW1haWwiOiJuZXd1c2VyQGV4YW1wbGUuY29tIn0.signature
 *                   refresh_token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXAiOiJyZWZyZXNoIiwic2lkIjoibmV3LXNlc3Npb24tdXVpZCIsInVzZXJfaWQiOjQ2LCJlbWFpbCI6Im5ld3VzZXJAZXhhbXBsZS5jb20ifQ.signature
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: Invalid or expired verified_token
 *       500:
 *         description: 회원가입 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   error: Failed to signup
 */
// POST /api/signup
// body: multipart/form-data { verified_token, email, name, description?, image? }
// OTP 인증 후 발급된 verified_token으로 프로필 설정 + access_token + refresh_token 반환 (신규 유저)
export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const verified_token = formData.get("verified_token") as string | null;
  const email = formData.get("email") as string | null;
  const name = formData.get("name") as string | null;
  const description = (formData.get("description") as string | null) ?? null;
  const imageFile = formData.get("image") as File | null;

  if (!verified_token) {
    return NextResponse.json({ error: "verified_token is required" }, { status: 400 });
  }
  if (!email || !name) {
    return NextResponse.json({ error: "email and name are required" }, { status: 400 });
  }

  let claims: VerifiedTokenClaims;
  try {
    claims = await verifyJwt<VerifiedTokenClaims>(verified_token);
  } catch {
    return NextResponse.json({ error: "Invalid or expired verified_token" }, { status: 400 });
  }

  if (!claims || claims.typ !== "verified" || !claims.user_id || !claims.email) {
    return NextResponse.json({ error: "Invalid verified_token" }, { status: 400 });
  }

  let image_id: string | null = null;
  if (imageFile && imageFile.size > 0) {
    try {
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      const result = await uploadImageAndSave(
        buffer,
        imageFile.type
      );
      image_id = result.imageId;
    } catch {
      return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
    }
  }

  const updateData: Record<string, unknown> = { name, description };
  if (image_id) updateData.image_id = image_id;

  const { error } = await getSupabase()
    .from("userinfo")
    .update(updateData)
    .eq("user_id", claims.user_id);

  if (error) {
    console.error("signup error:", error);
    return NextResponse.json({ error: "Failed to signup" }, { status: 500 });
  }

  const sessionId = newSessionId();
  const access_token = await signAccessToken({ typ: "access", user_id: claims.user_id, email: claims.email });
  const refresh_token = await signRefreshToken({ typ: "refresh", sid: sessionId, user_id: claims.user_id, email: claims.email });

  const refreshTtl = Number(process.env.AUTH_REFRESH_TOKEN_TTL_SECONDS ?? 60 * 60 * 24 * 30);
  await createRefreshSession({
    session_id: sessionId,
    user_id: claims.user_id,
    email: claims.email,
    refresh_token,
    expiresAt: new Date(Date.now() + refreshTtl * 1000),
  });

  return NextResponse.json({ access_token, refresh_token });
}
