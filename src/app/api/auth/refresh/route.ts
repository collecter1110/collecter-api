import { NextRequest, NextResponse } from "next/server";
import {
  createRefreshSession,
  isRefreshSessionValid,
  newSessionId,
  revokeRefreshSessionById,
} from "@/lib/authStore";
import {
  signAccessToken,
  signRefreshToken,
  verifyJwt,
  type RefreshTokenClaims,
} from "@/lib/jwt";

// POST /api/auth/refresh
// body: { refresh_token: string }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const refresh_token = body?.refresh_token as string | undefined;

  if (!refresh_token) {
    return NextResponse.json(
      { error: "refresh_token is required" },
      { status: 400 }
    );
  }

  let claims: RefreshTokenClaims;
  try {
    claims = await verifyJwt<RefreshTokenClaims>(refresh_token);
  } catch {
    return NextResponse.json({ error: "Invalid refresh token" }, { status: 400 });
  }

  if (!claims || claims.typ !== "refresh" || !claims.sid || !claims.user_id || !claims.email) {
    return NextResponse.json({ error: "Invalid refresh token" }, { status: 400 });
  }

  const ok = await isRefreshSessionValid({
    session_id: claims.sid,
    refresh_token,
  });

  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rotate refresh token (revoke old session, create new session)
  const newSid = newSessionId();
  const access_token = await signAccessToken({
    typ: "access",
    user_id: claims.user_id,
    email: claims.email,
  });
  const new_refresh_token = await signRefreshToken({
    typ: "refresh",
    sid: newSid,
    user_id: claims.user_id,
    email: claims.email,
  });

  const refreshTtl = Number(process.env.AUTH_REFRESH_TOKEN_TTL_SECONDS ?? 60 * 60 * 24 * 30);
  await createRefreshSession({
    session_id: newSid,
    user_id: claims.user_id,
    email: claims.email,
    refresh_token: new_refresh_token,
    expiresAt: new Date(Date.now() + refreshTtl * 1000),
  });

  await revokeRefreshSessionById(claims.sid);

  return NextResponse.json({
    access_token,
    refresh_token: new_refresh_token,
  });
}

