import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

// POST /api/keywords — addKeywords
// body: { keywords: string[], category_id: number }
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { keywords, category_id } = body;

  if (!keywords || !Array.isArray(keywords) || !category_id) {
    return NextResponse.json(
      { error: "keywords array and category_id are required" },
      { status: 400 }
    );
  }

  const entries = keywords.map((keyword: string) => ({
    keyword_name: keyword,
    category_id,
  }));

  await getSupabase().from("keywordinfo").insert(entries);

  const { data, error } = await getSupabase()
    .from("keywordinfo")
    .select("keyword_name, keyword_id")
    .eq("category_id", category_id)
    .in("keyword_name", keywords);

  if (error) {
    console.error("addKeywords error:", error);
    return NextResponse.json({ error: "Failed to fetch keywords" }, { status: 500 });
  }

  return NextResponse.json({ keywords: data });
}
