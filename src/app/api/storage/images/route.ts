import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { callEdgeFunction } from "@/lib/edge";

// DELETE /api/storage/images — deleteStorageImages
// body: { folder_path: string, image_file_paths: string[] }
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { folder_path, image_file_paths } = body;

  if (!folder_path || !image_file_paths || !Array.isArray(image_file_paths)) {
    return NextResponse.json(
      { error: "folder_path and image_file_paths array are required" },
      { status: 400 }
    );
  }

  const fullFilePaths = (image_file_paths as string[]).map(
    (fp) => `${auth.userId}/${folder_path}/${fp}`
  );

  const response = await callEdgeFunction("delete-images", auth.accessToken, {
    filePaths: fullFilePaths,
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("delete-images edge function error:", data);
    return NextResponse.json(
      { error: data.error || "Failed to delete images" },
      { status: response.status }
    );
  }

  return NextResponse.json(data);
}
