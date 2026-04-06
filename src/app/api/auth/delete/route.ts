import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

// DELETE /api/auth/delete
// deleteAuthUser (Local Auth): delete by user_id/email (and revoke sessions)
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  // Revoke refresh sessions
  await getSupabase()
    .from("auth_refresh_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", auth.userId)
    .is("revoked_at", null);

  // Delete userinfo row (and rely on DB constraints/cascades if configured)
  const { error } = await getSupabase()
    .from("userinfo")
    .delete()
    .eq("user_id", auth.userId);

  if (error) {
    console.error("deleteAuthUser error:", error);
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
