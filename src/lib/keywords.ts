import { getSupabase } from "@/lib/supabase";

function normalizeKeywords(keywords: unknown): string[] | null {
  if (!Array.isArray(keywords)) return null;
  const cleaned = keywords
    .map((k) => (typeof k === "string" ? k.trim() : ""))
    .filter((k) => k.length > 0);
  if (cleaned.length === 0) return [];
  return Array.from(new Set(cleaned));
}

export function parseKeywordsJson(raw: string | null): string[] | null {
  if (raw === null) return null;
  try {
    return normalizeKeywords(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function ensureKeywordsInCategory(
  categoryId: number,
  keywords: string[]
): Promise<void> {
  if (keywords.length === 0) return;

  const entries = keywords.map((keyword_name) => ({
    keyword_name,
    category_id: categoryId,
  }));

  // NOTE: This expects a unique constraint on (category_id, keyword_name).
  // If not present, this will still insert but may allow duplicates depending on DB.
  const { error } = await getSupabase()
    .from("keywordinfo")
    .upsert(entries, { onConflict: "category_id,keyword_name", ignoreDuplicates: true });

  if (error) {
    throw new Error("Failed to save keywords");
  }
}

