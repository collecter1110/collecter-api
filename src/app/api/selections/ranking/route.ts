import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";

// GET /api/selections/ranking — getRankingSelections
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  const userId = auth?.userId ?? 0;

  const { data, error } = await getSupabase().rpc("get_ranking_selections", {
    input_user_id: userId,
  });

  if (error) {
    console.error("getRankingSelections error:", error);
    return NextResponse.json(
      { error: "Failed to fetch ranking selections" },
      { status: 500 }
    );
  }

  const selections = (data ?? []).map((item: Record<string, unknown>) => {
    const paths = item.image_file_paths as string[] | null;
    return {
      ...item,
      thumb_file_path: paths && paths.length > 0 ? paths[0] : null,
    };
  });

  return NextResponse.json({ selections });
}
