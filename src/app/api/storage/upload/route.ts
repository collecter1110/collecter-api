import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { callEdgeFunction } from "@/lib/edge";

// POST /api/storage/upload — uploadAndGetImageFileNames (presigned URL 요청)
// body: { file_paths: string[] }  (예: ["userId/collections/image.jpg"])
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { file_paths } = body;

  if (!file_paths || !Array.isArray(file_paths)) {
    return NextResponse.json(
      { error: "file_paths array is required" },
      { status: 400 }
    );
  }

  const response = await callEdgeFunction("upload-images", auth.accessToken, {
    filePaths: file_paths,
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("upload-images edge function error:", data);
    return NextResponse.json(
      { error: data.error || "Failed to get upload URLs" },
      { status: response.status }
    );
  }

  // presignedUrls: [{ filePath, url }]
  return NextResponse.json(data);
}
