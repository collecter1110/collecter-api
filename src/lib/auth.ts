import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "./supabase";
import { verifyJwt, type AccessTokenClaims } from "./jwt";

export interface AuthContext {
  userId: number;
  email: string;
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
  if (!claims.user_id || !claims.email) return null;

  // Optional: ensure user still exists
  const { data, error: dbError } = await getSupabase()
    .from("userinfo")
    .select("user_id, email")
    .eq("user_id", claims.user_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (dbError || !data) return null;

  return { userId: data.user_id, email: String(data.email), accessToken: token };
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
