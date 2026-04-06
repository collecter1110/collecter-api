import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { createRefreshSession, newSessionId } from "@/lib/authStore";
import { signAccessToken, signRefreshToken, verifyJwt, type VerifiedTokenClaims } from "@/lib/jwt";
import { uploadImageAndSave } from "@/lib/storage";

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
