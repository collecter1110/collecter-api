import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

// DELETE /api/membership — cancelMembership
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  // Soft delete: keep collections/selections, but make user unresolvable by user_id.
  // Also revoke refresh sessions so tokens can't be refreshed.
  await getSupabase()
    .from("auth_refresh_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", auth.userId)
    .is("revoked_at", null);

  const { error } = await getSupabase()
    .from("userinfo")
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", auth.userId)
    .is("deleted_at", null);

  if (error) {
    console.error("cancelMembership soft-delete error:", error);
    return NextResponse.json(
      { error: "Failed to cancel membership" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
