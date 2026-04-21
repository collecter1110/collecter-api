/**
 * image_id가 null인 컬렉션에 셀렉션 이미지를 backfill합니다.
 *
 * 실행: npx tsx scripts/backfill-collection-covers.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getFirstActiveImageId(collectionId: number): Promise<string | null> {
  const { data: csData, error: csError } = await supabase
    .from("collection_selections")
    .select("selection_id")
    .eq("collection_id", collectionId);

  if (csError || !csData || csData.length === 0) return null;

  const selectionIds = csData.map((r) => r.selection_id);

  const { data: imgData, error: imgError } = await supabase
    .from("selection_images")
    .select("image_id, created_at, sort_order, images(deleted_at)")
    .in("selection_id", selectionIds)
    .order("created_at", { ascending: true })
    .order("sort_order", { ascending: true });

  if (imgError || !imgData) return null;

  for (const row of imgData) {
    const images = (row as unknown as { images: { deleted_at: string | null }[] }).images;
    const deletedAt = images?.[0]?.deleted_at ?? null;
    if (!deletedAt) return (row as { image_id: string }).image_id;
  }

  return null;
}

async function main() {
  const { data: collections, error } = await supabase
    .from("collections")
    .select("id, title")
    .is("image_id", null);

  if (error) {
    console.error("collections 조회 실패:", error.message);
    process.exit(1);
  }

  console.log(`image_id가 null인 컬렉션: ${collections.length}개\n`);

  let updated = 0;
  let skipped = 0;

  for (const col of collections) {
    const imageId = await getFirstActiveImageId(col.id);

    if (!imageId) {
      console.log(`[SKIP] collection ${col.id} (${col.title}) — 사용 가능한 이미지 없음`);
      skipped++;
      continue;
    }

    const { error: updateError } = await supabase
      .from("collections")
      .update({ image_id: imageId })
      .eq("id", col.id);

    if (updateError) {
      console.error(`[ERROR] collection ${col.id} 업데이트 실패:`, updateError.message);
      continue;
    }

    console.log(`[OK] collection ${col.id} (${col.title}) → image_id: ${imageId}`);
    updated++;
  }

  console.log(`\n완료 — 업데이트: ${updated}개 / 스킵: ${skipped}개`);
}

main().catch((e) => {
  console.error("오류:", e);
  process.exit(1);
});
