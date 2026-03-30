import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { callEdgeFunction } from "@/lib/edge";

// DELETE /api/membership — cancelMembership
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const response = await callEdgeFunction("delete-user", auth.accessToken);

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("cancelMembership edge function error:", data);
    return NextResponse.json(
      { error: data.error || "Failed to cancel membership" },
      { status: response.status }
    );
  }

  return NextResponse.json({ success: true });
}
