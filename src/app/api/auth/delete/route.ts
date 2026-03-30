import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

// DELETE /api/auth/delete
// deleteAuthUser: delete_user_by_owner RPC 호출
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { error } = await getSupabase().rpc("delete_user_by_owner", {
    user_uuid: auth.userUuid,
  });

  if (error) {
    console.error("deleteAuthUser error:", error);
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
