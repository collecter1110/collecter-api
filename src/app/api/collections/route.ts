import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

// POST /api/collections — addCollection
// body: { category_id, title, description?, tags?, is_public }
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { category_id, title, description, tags, is_public } = body;

  if (!category_id || !title) {
    return NextResponse.json(
      { error: "category_id and title are required" },
      { status: 400 }
    );
  }

  const { error } = await getSupabase().from("collections").insert({
    category_id,
    user_id: auth.userId,
    title,
    description: description ?? null,
    tags: tags ?? null,
    is_public: is_public ?? true,
  });

  if (error) {
    console.error("addCollection error:", error);
    return NextResponse.json(
      { error: "Failed to create collection" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
