/**
 * 컬렉션 이미지 마이그레이션 스크립트
 *
 * collections.image_file_path에서 셀렉션 파일명을 추출하여
 * 이미 마이그레이션된 selection_images의 image_id를 찾아 연결합니다.
 * (S3 복사 없음 - DB 매핑만)
 *
 * 사용법:
 *   tsx scripts/migrate-collection-images.ts            # dry-run
 *   tsx scripts/migrate-collection-images.ts --execute  # 실제 실행
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

const DRY_RUN = !process.argv.includes("--execute");

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("필수 환경변수 누락");
  process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function log(msg: string) {
  console.log(msg);
}

async function main() {
  log("========================================");
  log(DRY_RUN ? "DRY RUN 모드" : "EXECUTE 모드");
  log("========================================");

  // 1) 셀렉션 파일명 → image_id 매핑 구축
  log("\n=== 셀렉션 파일명 -> image_id 매핑 구축 ===");

  const { data: selections, error: selErr } = await supabase
    .from("selections_v2")
    .select("id, image_file_paths")
    .not("image_file_paths", "is", null);

  if (selErr) throw new Error(`selections_v2 조회 실패: ${selErr.message}`);

  // 파일명 → image_id 맵
  const filenameToImageId = new Map<string, string>();

  for (const sel of selections ?? []) {
    const paths = sel.image_file_paths as string[];
    if (!Array.isArray(paths) || paths.length === 0) continue;

    const { data: si } = await supabase
      .from("selection_images")
      .select("image_id, sort_order")
      .eq("selection_id", sel.id)
      .order("sort_order");

    if (!si) continue;

    for (let i = 0; i < Math.min(paths.length, si.length); i++) {
      filenameToImageId.set(paths[i], si[i].image_id);
    }
  }

  log(`매핑 완료: ${filenameToImageId.size}개`);

  // 2) 컬렉션 마이그레이션
  log("\n=== collections -> image_id 마이그레이션 ===");

  const { data: collections, error: colErr } = await supabase
    .from("collections")
    .select("id, image_file_path")
    .not("image_file_path", "is", null)
    .is("image_id", null);

  if (colErr) throw new Error(`collections 조회 실패: ${colErr.message}`);

  log(`대상: ${collections?.length ?? 0}건`);

  let matchCount = 0;
  let noMatchCount = 0;

  for (const col of collections ?? []) {
    const filename = col.image_file_path as string;
    const collectionId = col.id as number;

    // {collectionId}_ prefix 제거 → 원본 셀렉션 파일명
    const prefix = `${collectionId}_`;
    const selectionFilename = filename.startsWith(prefix)
      ? filename.slice(prefix.length)
      : null;

    const imageId = selectionFilename
      ? filenameToImageId.get(selectionFilename)
      : undefined;

    if (imageId) {
      if (DRY_RUN) {
        log(`  [DRY] collection_id=${collectionId}: ${filename} -> image_id=${imageId}`);
      } else {
        const { error: updErr } = await supabase
          .from("collections")
          .update({ image_id: imageId })
          .eq("id", collectionId);
        if (updErr) {
          log(`  오류: collection_id=${collectionId} - ${updErr.message}`);
          continue;
        }
        log(`  collection_id=${collectionId}: ${filename} -> image_id=${imageId}`);
      }
      matchCount++;
    } else {
      log(`  매칭 없음: collection_id=${collectionId}, filename=${filename}`);
      noMatchCount++;
    }
  }

  log("\n=== 결과 ===");
  log(`  매칭 성공: ${matchCount}개`);
  log(`  매칭 없음: ${noMatchCount}개`);

  log("\n========================================");
  log(DRY_RUN ? "Dry run 완료. --execute 플래그로 실제 실행하세요." : "마이그레이션 완료.");
  log("========================================");
}

main().catch((e) => {
  console.error("마이그레이션 실패:", e);
  process.exit(1);
});
