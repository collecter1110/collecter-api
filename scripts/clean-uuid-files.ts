/**
 * S3에서 기존 UUID 형태 파일 삭제 (응답 디버깅 포함)
 *
 * 사용법:
 *   tsx scripts/clean-uuid-files.ts            # dry-run
 *   tsx scripts/clean-uuid-files.ts --execute  # 실제 삭제
 */

import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
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

const AWS_REGION = process.env.AWS_REGION ?? "ap-northeast-2";
const BUCKET =
  process.env.AWS_BUCKET_NAME ??
  process.env.AWS_BUCKET ??
  process.env.S3_BUCKET_NAME ??
  process.env.S3_BUCKET!;

if (!BUCKET) {
  console.error("BUCKET 환경변수 누락");
  process.exit(1);
}

const s3 = new S3Client({ region: AWS_REGION });

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.\w+$/;

async function main() {
  console.log(`Bucket: ${BUCKET}`);
  console.log(DRY_RUN ? "DRY RUN 모드\n" : "EXECUTE 모드\n");

  // 1) UUID 파일 수집
  let continuationToken: string | undefined;
  const uuidKeys: string[] = [];

  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      })
    );

    for (const obj of res.Contents ?? []) {
      if (UUID_REGEX.test(obj.Key!)) {
        uuidKeys.push(obj.Key!);
      }
    }

    continuationToken = res.NextContinuationToken;
  } while (continuationToken);

  console.log(`UUID 파일 수: ${uuidKeys.length}개\n`);

  if (uuidKeys.length === 0) {
    console.log("삭제할 파일 없음");
    return;
  }

  if (DRY_RUN) {
    uuidKeys.slice(0, 5).forEach((k) => console.log(`  [DRY] ${k}`));
    if (uuidKeys.length > 5) console.log(`  ... 외 ${uuidKeys.length - 5}개`);
    console.log("\n--execute 플래그로 실제 삭제하세요.");
    return;
  }

  // 2) 삭제 (1000개씩 배치, 응답 확인)
  let deletedTotal = 0;
  let errorTotal = 0;

  for (let i = 0; i < uuidKeys.length; i += 1000) {
    const batch = uuidKeys.slice(i, i + 1000);

    const result = await s3.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: {
          Objects: batch.map((Key) => ({ Key })),
          Quiet: false,
        },
      })
    );

    const deleted = result.Deleted?.length ?? 0;
    const errors = result.Errors ?? [];

    deletedTotal += deleted;
    errorTotal += errors.length;

    console.log(`배치 ${i + 1}~${i + batch.length}: 삭제 ${deleted}개, 오류 ${errors.length}개`);

    for (const err of errors) {
      console.log(`  오류: ${err.Key} - ${err.Code}: ${err.Message}`);
    }
  }

  console.log(`\n삭제 완료: ${deletedTotal}개`);
  if (errorTotal > 0) console.log(`오류: ${errorTotal}개`);

  // 3) 삭제 후 확인
  let remaining = 0;
  continuationToken = undefined;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      })
    );
    for (const obj of res.Contents ?? []) {
      if (UUID_REGEX.test(obj.Key!)) remaining++;
    }
    continuationToken = res.NextContinuationToken;
  } while (continuationToken);

  console.log(`삭제 후 남은 UUID 파일: ${remaining}개`);
}

main().catch((e) => {
  console.error("오류:", e);
  process.exit(1);
});
