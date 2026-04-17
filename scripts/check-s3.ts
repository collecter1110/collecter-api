/**
 * S3 버킷 버저닝 상태 확인 + 삭제 재시도
 */

import { S3Client, GetBucketVersioningCommand, ListObjectVersionsCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
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

const AWS_REGION = process.env.AWS_REGION ?? "ap-northeast-2";
const BUCKET =
  process.env.AWS_BUCKET_NAME ??
  process.env.AWS_BUCKET ??
  process.env.S3_BUCKET_NAME ??
  process.env.S3_BUCKET!;

const s3 = new S3Client({ region: AWS_REGION });

async function main() {
  // 1) 버저닝 상태 확인
  const versioning = await s3.send(new GetBucketVersioningCommand({ Bucket: BUCKET }));
  console.log(`버킷: ${BUCKET}`);
  console.log(`버저닝 상태: ${versioning.Status ?? "없음(Disabled)"}\n`);
}

main().catch((e) => {
  console.error("오류:", e);
  process.exit(1);
});
