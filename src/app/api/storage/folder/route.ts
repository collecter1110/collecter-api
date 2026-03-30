import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { callEdgeFunction } from "@/lib/edge";

// DELETE /api/storage/folder — deleteStorageFolder
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const response = await callEdgeFunction("delete-folder", auth.accessToken, {
    folderPath: String(auth.userId),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("delete-folder edge function error:", data);
    return NextResponse.json(
      { error: data.error || "Failed to delete folder" },
      { status: response.status }
    );
  }

  return NextResponse.json(data);
}
