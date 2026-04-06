import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

// POST /api/reports — report
// body: { report_type: number, reported_post_id: { [key: string]: number }, report_reason: string }
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { report_type, reported_post_id, report_reason } = body;

  if (!report_type || !reported_post_id || !report_reason) {
    return NextResponse.json(
      { error: "report_type, reported_post_id, report_reason are required" },
      { status: 400 }
    );
  }

  const { error } = await getSupabase().from("reports").insert({
    report_type,
    report_reason,
    reporter_user_id: auth.userId,
    reported_post_id,
  });

  if (error) {
    console.error("report error:", error);
    return NextResponse.json({ error: "Failed to submit report" }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
