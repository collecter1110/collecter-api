import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// GET /api/categories — getCategoryInfo
export async function GET() {
  const { data, error } = await getSupabase().from("categoryinfo").select("*");

  if (error) {
    console.error("getCategoryInfo error:", error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 }
    );
  }

  return NextResponse.json({ categories: data });
}
