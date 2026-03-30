import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "./supabase";

export interface AuthContext {
  userId: number;
  userUuid: string;
  accessToken: string;
}

export async function getAuthContext(
  request: NextRequest
): Promise<AuthContext | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const {
    data: { user },
    error,
  } = await getSupabase().auth.getUser(token);

  if (error || !user) return null;

  const { data, error: dbError } = await getSupabase()
    .from("userinfo")
    .select("user_id")
    .eq("email", user.email)
    .single();

  if (dbError || !data) return null;

  return { userId: data.user_id, userUuid: user.id, accessToken: token };
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
