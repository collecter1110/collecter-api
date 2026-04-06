import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { revokeRefreshSessionByToken } from "@/lib/authStore";
import { verifyJwt, type RefreshTokenClaims } from "@/lib/jwt";

// POST /api/auth/logout
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  // Client should send refresh token to revoke current session
  const body = await request.json().catch(() => ({}));
  const refresh_token = body?.refresh_token as string | undefined;
  if (!refresh_token) {
    return NextResponse.json(
      { error: "refresh_token is required" },
      { status: 400 }
    );
  }

  try {
    const claims = await verifyJwt<RefreshTokenClaims>(refresh_token);
    if (!claims || claims.typ !== "refresh") {
      return NextResponse.json({ error: "Invalid refresh token" }, { status: 400 });
    }
    await revokeRefreshSessionByToken(refresh_token);
  } catch (e) {
    console.error("logout error:", e);
    return NextResponse.json({ error: "Failed to logout" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
