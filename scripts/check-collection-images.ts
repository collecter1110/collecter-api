/**
 * collections.image_id 중 S3에 실제 파일이 없는 것을 출력합니다.
 *
 * 실행: npx tsx scripts/check-collection-images.ts
 */

import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
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
const AWS_REGION = process.env.AWS_REGION ?? "ap-northeast-2";
const BUCKET =
  process.env.AWS_BUCKET_NAME ??
  process.env.AWS_BUCKET ??
  process.env.S3_BUCKET_NAME ??
  process.env.S3_BUCKET!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.");
  process.exit(1);
}
if (!BUCKET) {
  console.error("S3 버킷 환경변수가 필요합니다 (AWS_BUCKET_NAME 등).");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const s3 = new S3Client({ region: AWS_REGION });

async function existsInS3(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log(`버킷: ${BUCKET}\n`);

  // collections에서 image_id가 있는 것만 조회
  const { data: collections, error } = await supabase
    .from("collections")
    .select("id, title, image_id")
    .not("image_id", "is", null);

  if (error) {
    console.error("collections 조회 실패:", error.message);
    process.exit(1);
  }

  // image_id → file_path 매핑을 images 테이블에서 조회
  const imageIds = collections.map((c) => c.image_id as string);
  const { data: images, error: imgError } = await supabase
    .from("images")
    .select("image_id, file_path, deleted_at")
    .in("image_id", imageIds);

  if (imgError) {
    console.error("images 조회 실패:", imgError.message);
    process.exit(1);
  }

  const imageMap = new Map(
    (images ?? []).map((i) => [i.image_id as string, i as { image_id: string; file_path: string; deleted_at: string | null }])
  );

  console.log(`총 컬렉션 (image_id 있는 것): ${collections.length}개\n`);

  const missing: { collection_id: number; title: string; image_id: string; reason: string }[] = [];

  for (const col of collections) {
    const imageId = col.image_id as string;
    const imgRow = imageMap.get(imageId);

    if (!imgRow) {
      missing.push({ collection_id: col.id, title: col.title, image_id: imageId, reason: "images 테이블에 없음" });
      continue;
    }

    if (imgRow.deleted_at) {
      missing.push({ collection_id: col.id, title: col.title, image_id: imageId, reason: `deleted_at: ${imgRow.deleted_at}` });
      continue;
    }

    const exists = await existsInS3(imgRow.file_path);
    if (!exists) {
      missing.push({ collection_id: col.id, title: col.title, image_id: imageId, reason: `S3에 없음 (key: ${imgRow.file_path})` });
    }
  }

  if (missing.length === 0) {
    console.log("모든 이미지가 S3에 정상적으로 존재합니다.");
    return;
  }

  console.log(`문제 있는 컬렉션: ${missing.length}개\n`);
  console.log("collection_id | title | image_id | reason");
  console.log("-".repeat(80));
  for (const m of missing) {
    console.log(`${m.collection_id} | ${m.title} | ${m.image_id} | ${m.reason}`);
  }
}

main().catch((e) => {
  console.error("오류:", e);
  process.exit(1);
});
