/**
 * 이미지 마이그레이션 스크립트
 *
 * 기존 S3 경로({userId}/{type}/{filename}) → 플랫 경로({uuid}.jpg)로 복사하고
 * images 테이블에 등록한 뒤, 각 테이블의 image_id를 업데이트합니다.
 *
 * 핵심: 컬렉션 커버 이미지는 셀렉션 이미지의 복사본이므로 같은 image_id를 공유합니다.
 *       ({collectionId}_{selectionFilename} → selectionFilename과 동일 image_id)
 *
 * 기존 S3 파일, image_file_path 컬럼은 건드리지 않습니다.
 *
 * 사용법:
 *   tsx scripts/migrate-images.ts            # dry-run (실제 변경 없음)
 *   tsx scripts/migrate-images.ts --execute  # 실제 실행
 */

import { S3Client, CopyObjectCommand } from "@aws-sdk/client-s3";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";

// --- 환경변수 로드 (.env.local) ---
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
const AWS_REGION = process.env.AWS_REGION ?? "ap-northeast-2";
const BUCKET =
  process.env.AWS_BUCKET_NAME ??
  process.env.AWS_BUCKET ??
  process.env.S3_BUCKET_NAME ??
  process.env.S3_BUCKET!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !BUCKET) {
  console.error("❌ 필수 환경변수 누락: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AWS_BUCKET_NAME");
  process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const s3 = new S3Client({ region: AWS_REGION });

// 셀렉션 이미지 파일명 → image_id 매핑 (컬렉션 커버 매칭용)
const selectionFilenameMap = new Map<string, string>();

// -------------------------------------------------------------------

function log(msg: string) {
  console.log(msg);
}

/**
 * S3 복사 + images 테이블 등록
 */
async function copyAndRegister(s3Key: string): Promise<string> {
  const imageId = randomUUID();
  const newKey = `${imageId}.jpg`;

  if (DRY_RUN) {
    log(`  [DRY] S3 복사: ${s3Key} → ${newKey}`);
    log(`  [DRY] images insert: image_id=${imageId}`);
    return imageId;
  }

  await s3.send(
    new CopyObjectCommand({
      Bucket: BUCKET,
      CopySource: `${BUCKET}/${s3Key}`,
      Key: newKey,
    })
  );

  const { error } = await supabase
    .from("images")
    .insert({ image_id: imageId, file_path: newKey });

  if (error) throw new Error(`images insert 실패: ${error.message}`);

  log(`  ✓ S3 복사: ${s3Key} → ${newKey} (image_id=${imageId})`);
  return imageId;
}

// -------------------------------------------------------------------
// 1단계: selections → selection_images
// -------------------------------------------------------------------
async function migrateSelections() {
  log("\n=== [1/3] selections → selection_images 마이그레이션 ===");

  const { data, error } = await supabase
    .from("selections")
    .select("collection_id, selection_id, user_id, image_file_paths")
    .not("image_file_paths", "is", null);

  if (error) throw new Error(`selections 조회 실패: ${error.message}`);

  const targets = (data ?? []).filter(
    (r) => Array.isArray(r.image_file_paths) && r.image_file_paths.length > 0
  );
  log(`대상: ${targets.length}건`);

  for (const row of targets) {
    const paths = row.image_file_paths as string[];
    log(`\nselection (coll=${row.collection_id}, sel=${row.selection_id}) 이미지 ${paths.length}개`);

    // idempotent: 이미 selection_images에 데이터 있으면 건너뜀
    const { data: existing } = await supabase
      .from("selection_images")
      .select("image_id")
      .eq("collection_id", row.collection_id)
      .eq("selection_id", row.selection_id);

    if (existing && existing.length > 0) {
      log(`  ↩ 이미 selection_images 존재 (${existing.length}개), 건너뜀`);
      // 기존 데이터라도 맵에 등록 (컬렉션 매칭용)
      for (let i = 0; i < Math.min(paths.length, existing.length); i++) {
        selectionFilenameMap.set(paths[i], existing[i].image_id);
      }
      continue;
    }

    for (let i = 0; i < paths.length; i++) {
      const filename = paths[i];
      const s3Key = `${row.user_id}/selections/${filename}`;
      log(`  [${i}] ${filename}`);

      try {
        const imageId = await copyAndRegister(s3Key);

        // 파일명 → image_id 매핑 등록 (컬렉션 커버 매칭용)
        selectionFilenameMap.set(filename, imageId);

        if (!DRY_RUN) {
          const { error: insErr } = await supabase.from("selection_images").insert({
            collection_id: row.collection_id,
            selection_id: row.selection_id,
            image_id: imageId,
            sort_order: i,
          });
          if (insErr) throw new Error(`selection_images insert 실패: ${insErr.message}`);
          log(`  ✓ selection_images 삽입 (sort_order=${i})`);
        } else {
          log(`  [DRY] selection_images insert: image_id=${imageId}, sort_order=${i}`);
        }
      } catch (e) {
        log(`  ❌ 오류 (건너뜀): ${(e as Error).message}`);
      }
    }
  }

  log(`\n셀렉션 파일명 맵 등록: ${selectionFilenameMap.size}개`);
}

// -------------------------------------------------------------------
// 2단계: collections (셀렉션 image_id 재사용)
// -------------------------------------------------------------------
async function migrateCollections() {
  log("\n=== [2/3] collections 마이그레이션 ===");

  const { data, error } = await supabase
    .from("collections")
    .select("id, user_id, image_file_path")
    .not("image_file_path", "is", null)
    .is("image_id", null);

  if (error) throw new Error(`collections 조회 실패: ${error.message}`);
  log(`대상: ${data?.length ?? 0}건`);

  let matchCount = 0;
  let newCount = 0;

  for (const row of data ?? []) {
    const filename = row.image_file_path as string;
    const collectionId = row.id as number;
    log(`\ncollection_id=${collectionId}  filename=${filename}`);

    // {collectionId}_ prefix 제거 → 원본 셀렉션 파일명
    const prefix = `${collectionId}_`;
    const selectionFilename = filename.startsWith(prefix)
      ? filename.slice(prefix.length)
      : null;

    // 매칭 시도
    const matchedImageId = selectionFilename
      ? selectionFilenameMap.get(selectionFilename)
      : undefined;

    try {
      let imageId: string;

      if (matchedImageId) {
        // 셀렉션 이미지와 동일 → S3 복사 없이 image_id 재사용
        imageId = matchedImageId;
        matchCount++;
        log(`  ✓ 셀렉션 이미지 매칭: ${selectionFilename} → image_id=${imageId}`);
      } else {
        // 매칭 없음 → 독립 이미지로 S3 복사
        const s3Key = `${row.user_id}/collections/${filename}`;
        imageId = await copyAndRegister(s3Key);
        newCount++;
        log(`  ⚠ 매칭 없음, 새 이미지로 등록`);
      }

      if (!DRY_RUN) {
        const { error: updErr } = await supabase
          .from("collections")
          .update({ image_id: imageId })
          .eq("id", collectionId);
        if (updErr) throw new Error(`collections update 실패: ${updErr.message}`);
        log(`  ✓ collections.image_id 업데이트 완료`);
      } else {
        log(`  [DRY] collections.image_id = ${imageId}`);
      }
    } catch (e) {
      log(`  ❌ 오류 (건너뜀): ${(e as Error).message}`);
    }
  }

  log(`\n셀렉션 매칭: ${matchCount}건 / 새 이미지: ${newCount}건`);
}

// -------------------------------------------------------------------
// 3단계: userinfo
// -------------------------------------------------------------------
async function migrateUserinfo() {
  log("\n=== [3/3] userinfo 마이그레이션 ===");

  const { data, error } = await supabase
    .from("userinfo")
    .select("user_id, image_file_path")
    .not("image_file_path", "is", null)
    .is("image_id", null);

  if (error) throw new Error(`userinfo 조회 실패: ${error.message}`);
  log(`대상: ${data?.length ?? 0}건`);

  for (const row of data ?? []) {
    const filename = row.image_file_path as string;
    const s3Key = `${row.user_id}/userinfo/${filename}`;
    log(`\nuser_id=${row.user_id}  filename=${filename}`);

    try {
      const imageId = await copyAndRegister(s3Key);

      if (!DRY_RUN) {
        const { error: updErr } = await supabase
          .from("userinfo")
          .update({ image_id: imageId })
          .eq("user_id", row.user_id);
        if (updErr) throw new Error(`userinfo update 실패: ${updErr.message}`);
        log(`  ✓ userinfo.image_id 업데이트 완료`);
      } else {
        log(`  [DRY] userinfo.image_id = ${imageId}`);
      }
    } catch (e) {
      log(`  ❌ 오류 (건너뜀): ${(e as Error).message}`);
    }
  }
}

// -------------------------------------------------------------------
// 실행
// -------------------------------------------------------------------
async function main() {
  log("========================================");
  log(DRY_RUN ? "🔍 DRY RUN 모드 (실제 변경 없음)" : "🚀 EXECUTE 모드 (실제 변경 적용)");
  log(`Bucket: ${BUCKET}`);
  log("========================================");

  await migrateSelections();  // 1단계: 셀렉션 (맵 구축)
  await migrateCollections(); // 2단계: 컬렉션 (맵으로 매칭)
  await migrateUserinfo();    // 3단계: 유저

  log("\n========================================");
  log(DRY_RUN ? "✅ Dry run 완료. --execute 플래그로 실제 실행하세요." : "✅ 마이그레이션 완료.");
  log("========================================");
}

main().catch((e) => {
  console.error("❌ 마이그레이션 실패:", e);
  process.exit(1);
});
