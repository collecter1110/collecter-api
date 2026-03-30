import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { callEdgeFunction } from "@/lib/edge";

// POST /api/storage/copy — copyImage
// body: { source_folder_path, destination_folder_path, file_name, collection_id }
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { source_folder_path, destination_folder_path, file_name, collection_id } = body;

  if (!source_folder_path || !destination_folder_path || !file_name) {
    return NextResponse.json(
      { error: "source_folder_path, destination_folder_path, file_name are required" },
      { status: 400 }
    );
  }

  const response = await callEdgeFunction("copy-image", auth.accessToken, {
    sourceFolderPath: source_folder_path,
    destinationFolderPath: destination_folder_path,
    fileName: file_name,
    userId: auth.userId,
    collectionId: collection_id,
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("copy-image edge function error:", data);
    return NextResponse.json(
      { error: data.error || "Failed to copy image" },
      { status: response.status }
    );
  }

  return NextResponse.json(data);
}
