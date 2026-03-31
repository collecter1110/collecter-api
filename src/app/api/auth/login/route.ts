import { NextRequest, NextResponse } from "next/server";
import { createRefreshSession, newSessionId } from "@/lib/authStore";
import { signAccessToken, signRefreshToken, verifyJwt, type VerifiedTokenClaims } from "@/lib/jwt";

// POST /api/auth/login
// body: { verified_token: string }
// OTP 인증 후 발급된 verified_token으로 access_token + refresh_token 반환 (기존 유저)
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const verified_token = body?.verified_token as string | undefined;

  if (!verified_token) {
    return NextResponse.json({ error: "verified_token is required" }, { status: 400 });
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
