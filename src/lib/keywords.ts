import { getSupabase } from "@/lib/supabase";

export interface KeywordEntry {
  keyword_id: number;
  keyword_name: string;
}

function normalizeKeywordNames(keywords: unknown): string[] | null {
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
    return normalizeKeywordNames(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * keyword_name 목록을 keywordinfo에 upsert하고 {keyword_id, keyword_name}[] 반환.
 * selections.keywords / primary_keywords 저장 형식과 일치.
 */
export async function ensureKeywordsInCategory(
  categoryId: number,
  keywordNames: string[]
): Promise<KeywordEntry[]> {
  if (keywordNames.length === 0) return [];

  const entries = keywordNames.map((keyword_name) => ({
    keyword_name,
    category_id: categoryId,
  }));

  await getSupabase()
    .from("keywordinfo")
    .upsert(entries, { onConflict: "category_id,keyword_name", ignoreDuplicates: true });

  const { data, error } = await getSupabase()
    .from("keywordinfo")
    .select("keyword_id, keyword_name")
    .eq("category_id", categoryId)
    .in("keyword_name", keywordNames);

  if (error) {
    throw new Error("Failed to save keywords");
  }

  return data ?? [];
}
