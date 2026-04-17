/**
 * 셀렉션 이미지 마이그레이션 스크립트
 *
 * selections_v2.image_file_paths를 읽어
 * S3 복사({userId}/selections/{filename} → {uuid}.jpg) + images 테이블 등록 후
 * selection_images에 연결합니다.
 *
 * 사용법:
 *   tsx scripts/migrate-images.ts            # dry-run (실제 변경 없음)
 *   tsx scripts/migrate-images.ts --execute  # 실제 실행
 */

import { S3Client, CopyObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
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
  console.error("필수 환경변수 누락: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AWS_BUCKET_NAME");
  process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const s3 = new S3Client({ region: AWS_REGION });

// -------------------------------------------------------------------

function log(msg: string) {
  console.log(msg);
}

async function s3Exists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function migrateSelections() {
  log("\n=== selections_v2 -> selection_images 마이그레이션 ===");

  const { data, error } = await supabase
    .from("selections_v2")
    .select("id, user_id, image_file_paths")
    .not("image_file_paths", "is", null);

  if (error) throw new Error(`selections_v2 조회 실패: ${error.message}`);

  const targets = (data ?? []).filter(
    (r) => Array.isArray(r.image_file_paths) && r.image_file_paths.length > 0
  );
  log(`대상: ${targets.length}건`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const row of targets) {
    const paths = row.image_file_paths as string[];
    log(`\nselection_v2 (id=${row.id}, user=${row.user_id}) 이미지 ${paths.length}개`);

    // idempotent: 이미 selection_images에 데이터 있으면 건너뜀
    const { data: existing } = await supabase
      .from("selection_images")
      .select("image_id")
      .eq("selection_id", row.id);

    if (existing && existing.length > 0) {
      log(`  -> 이미 존재 (${existing.length}개), 건너뜀`);
      skipCount++;
      continue;
    }

    for (let i = 0; i < paths.length; i++) {
      const filename = paths[i];
      const s3Key = `${row.user_id}/selections/${filename}`;

      try {
        // S3 원본 존재 확인
        const exists = await s3Exists(s3Key);
        if (!exists) {
          log(`  [${i}] S3에 없음: ${s3Key}`);
          errorCount++;
          continue;
        }

        const imageId = randomUUID();
        const newKey = `${imageId}.jpg`;

        if (DRY_RUN) {
          log(`  [${i}] [DRY] ${s3Key} -> ${newKey}`);
          successCount++;
          continue;
        }

        // S3 복사
        await s3.send(
          new CopyObjectCommand({
            Bucket: BUCKET,
            CopySource: `${BUCKET}/${s3Key}`,
            Key: newKey,
          })
        );

        // images 테이블 삽입
        const { error: imgErr } = await supabase
          .from("images")
          .insert({ image_id: imageId, file_path: newKey });
        if (imgErr) throw new Error(`images insert 실패: ${imgErr.message}`);

        // selection_images 테이블 삽입
        const { error: siErr } = await supabase
          .from("selection_images")
          .insert({
            selection_id: row.id,
            image_id: imageId,
            sort_order: i,
          });
        if (siErr) throw new Error(`selection_images insert 실패: ${siErr.message}`);

        log(`  [${i}] ${filename} -> ${newKey}`);
        successCount++;
      } catch (e) {
        log(`  [${i}] 오류: ${(e as Error).message}`);
        errorCount++;
      }
    }
  }

  log("\n=== 결과 ===");
  log(`  성공: ${successCount}개`);
  log(`  건너뜀: ${skipCount}건`);
  log(`  오류: ${errorCount}개`);
}

// -------------------------------------------------------------------
// userinfo → images + userinfo.image_id 마이그레이션
// -------------------------------------------------------------------
async function migrateUserinfo() {
  log("\n=== userinfo -> images 마이그레이션 ===");

  const { data, error } = await supabase
    .from("userinfo")
    .select("user_id, image_file_path")
    .not("image_file_path", "is", null)
    .is("image_id", null);

  if (error) throw new Error(`userinfo 조회 실패: ${error.message}`);

  const targets = (data ?? []).filter((r) => r.image_file_path);
  log(`대상: ${targets.length}건`);

  let successCount = 0;
  let errorCount = 0;

  for (const row of targets) {
    const filename = row.image_file_path as string;
    const s3Key = `${row.user_id}/userinfo/${filename}`;
    log(`\nuser_id=${row.user_id}  filename=${filename}`);

    try {
      const exists = await s3Exists(s3Key);
      if (!exists) {
        log(`  S3에 없음: ${s3Key}`);
        errorCount++;
        continue;
      }

      const imageId = randomUUID();
      const newKey = `${imageId}.jpg`;

      if (DRY_RUN) {
        log(`  [DRY] ${s3Key} -> ${newKey}`);
        successCount++;
        continue;
      }

      // S3 복사
      await s3.send(
        new CopyObjectCommand({
          Bucket: BUCKET,
          CopySource: `${BUCKET}/${s3Key}`,
          Key: newKey,
        })
      );

      // images 테이블 삽입
      const { error: imgErr } = await supabase
        .from("images")
        .insert({ image_id: imageId, file_path: newKey });
      if (imgErr) throw new Error(`images insert 실패: ${imgErr.message}`);

      // userinfo.image_id 업데이트
      const { error: updErr } = await supabase
        .from("userinfo")
        .update({ image_id: imageId })
        .eq("user_id", row.user_id);
      if (updErr) throw new Error(`userinfo update 실패: ${updErr.message}`);

      log(`  ${filename} -> ${newKey}`);
      successCount++;
    } catch (e) {
      log(`  오류: ${(e as Error).message}`);
      errorCount++;
    }
  }

  log("\n=== userinfo 결과 ===");
  log(`  성공: ${successCount}개`);
  log(`  오류: ${errorCount}개`);
}

async function main() {
  log("========================================");
  log(DRY_RUN ? "DRY RUN 모드 (실제 변경 없음)" : "EXECUTE 모드 (실제 변경 적용)");
  log(`Bucket: ${BUCKET}`);
  log("========================================");

  await migrateSelections();
  await migrateUserinfo();

  log("\n========================================");
  log(DRY_RUN ? "Dry run 완료. --execute 플래그로 실제 실행하세요." : "마이그레이션 완료.");
  log("========================================");
}

main().catch((e) => {
  console.error("마이그레이션 실패:", e);
  process.exit(1);
});
