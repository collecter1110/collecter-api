import { NextRequest, NextResponse } from "next/server";
import { verifyJwt, type AccessTokenClaims } from "./jwt";
import { touchLastActive } from "./lastActive";

export interface AuthContext {
  userId: number;
  email: string;
  name: string;
  accessToken: string;
}

export async function getAuthContext(
  request: NextRequest
): Promise<AuthContext | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  let claims: AccessTokenClaims;
  try {
    claims = await verifyJwt<AccessTokenClaims>(token);
  } catch {
    return null;
  }

  if (!claims || claims.typ !== "access") return null;
  if (!claims.user_id || !claims.email || !claims.name) return null;

  // Not awaited: a failed or slow write must never cost the caller a request.
  touchLastActive(claims.user_id);

  return {
    userId: claims.user_id,
    email: claims.email,
    name: claims.name ?? "",
    accessToken: token,
  };
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function requireAuth(
  request: NextRequest
): Promise<AuthContext | NextResponse> {
  const ctx = await getAuthContext(request);
  if (!ctx) return unauthorized();
  return ctx;
}
