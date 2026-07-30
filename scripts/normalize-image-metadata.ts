/**
 * 기존 참조 이미지 메타데이터 정규화
 *
 * 앱에서 사용 중인 S3 객체의 Content-Type과 Cache-Control만 바로잡는다.
 * 이미지 바이트와 해상도는 절대 건드리지 않는다 — sharp를 쓰지 않고,
 * 동일 버킷·동일 키에 CopyObject(MetadataDirective=REPLACE)만 수행한다.
 *
 *   tsx scripts/normalize-image-metadata.ts                    # dry-run (기본)
 *   tsx scripts/normalize-image-metadata.ts --execute --confirm-metadata
 *   tsx scripts/normalize-image-metadata.ts --verify-sample 20  # 샘플 심층 검증 개수
 *
 * 고아 후보는 대상에서 제외한다 (audit-orphan-images.ts 참고).
 * 재실행 가능하며, 이미 정상인 객체는 건너뛴다.
 */

import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  GetObjectTaggingCommand,
  GetBucketVersioningCommand,
  type ListObjectsV2CommandOutput,
  type StorageClass,
  type ServerSideEncryption,
} from "@aws-sdk/client-s3";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}

const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");
const CONFIRMED = args.includes("--confirm-metadata");
const sampleIdx = args.indexOf("--verify-sample");
const SAMPLE_SIZE = sampleIdx >= 0 ? Number(args[sampleIdx + 1]) || 10 : 10;

const TARGET_CACHE_CONTROL = "public, max-age=31536000, immutable";

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
const OUT_DIR = path.resolve(process.cwd(), "scripts/out");

// -------------------------------------------------------------------
// 실제 포맷 감지 (확장자와 기존 Content-Type을 신뢰하지 않는다)
// -------------------------------------------------------------------

/** 파일 시그니처 판정에 필요한 최소 바이트만 Range GET으로 읽는다. */
const SIGNATURE_BYTES = 32;

const FORMAT_CONTENT_TYPE: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
  tiff: "image/tiff",
};

function detectFormat(b: Buffer): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "png";
  if (b.length >= 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP")
    return "webp";
  if (b.length >= 6 && b.subarray(0, 4).toString("ascii") === "GIF8") return "gif";
  if (b.length >= 12 && b.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = b.subarray(8, 12).toString("ascii");
    if (["heic", "heix", "hevc", "hevx", "heim", "heis"].includes(brand)) return "heic";
    if (["mif1", "msf1"].includes(brand)) return "heif";
    if (["avif", "avis"].includes(brand)) return "avif";
    return null; // 알 수 없는 ftyp 브랜드는 확정하지 않는다
  }
  if (b.length >= 4) {
    const le = b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00;
    const be = b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a;
    if (le || be) return "tiff";
  }
  return null;
}

// -------------------------------------------------------------------

type Target = {
  key: string;
  size: number;
  contentType?: string;
  cacheControl?: string;
  storageClass?: string;
  sse?: string;
  kmsKeyId?: string;
  etag?: string;
  metadata: Record<string, string>;
  checksum?: string;
  detected: string | null;
  signatureHex: string;
};

async function inUseImageKeys(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const [table, col] of [
    ["userinfo", "image_id"],
    ["collections", "image_id"],
    ["selection_images", "image_id"],
  ] as const) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from(table).select(col).range(from, from + 999);
      if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
      for (const row of data ?? []) {
        const v = (row as Record<string, unknown>)[col];
        if (typeof v === "string") ids.add(v);
      }
      if ((data ?? []).length < 1000) break;
    }
  }
  // 이미지 ID와 S3 키는 1:1 ({image_id}.jpg)
  return new Set([...ids].map((id) => `${id}.jpg`));
}

async function listAllObjects() {
  const objects: { key: string; size: number }[] = [];
  let token: string | undefined;
  do {
    const res: ListObjectsV2CommandOutput = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: token, MaxKeys: 1000 })
    );
    for (const o of res.Contents ?? []) objects.push({ key: o.Key!, size: o.Size ?? 0 });
    token = res.NextContinuationToken;
  } while (token);
  return objects;
}

async function inspect(key: string, size: number): Promise<Target> {
  const head = await s3.send(
    new HeadObjectCommand({ Bucket: BUCKET, Key: key, ChecksumMode: "ENABLED" })
  );
  const res = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key, Range: `bytes=0-${SIGNATURE_BYTES - 1}` })
  );
  const sig = Buffer.from(await res.Body!.transformToByteArray());

  return {
    key,
    size,
    contentType: head.ContentType,
    cacheControl: head.CacheControl,
    storageClass: head.StorageClass ?? "STANDARD",
    sse: head.ServerSideEncryption,
    kmsKeyId: head.SSEKMSKeyId,
    etag: head.ETag,
    metadata: head.Metadata ?? {},
    checksum:
      head.ChecksumSHA256 ?? head.ChecksumSHA1 ?? head.ChecksumCRC32 ?? head.ChecksumCRC32C ?? undefined,
    detected: detectFormat(sig),
    signatureHex: sig.subarray(0, 12).toString("hex"),
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    })
  );
  return out;
}

async function fullHash(key: string): Promise<{ sha256: string; length: number }> {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const buf = Buffer.from(await res.Body!.transformToByteArray());
  return { sha256: createHash("sha256").update(buf).digest("hex"), length: buf.length };
}

async function imageDimensions(key: string): Promise<string> {
  const sharp = (await import("sharp")).default;
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const buf = Buffer.from(await res.Body!.transformToByteArray());
  const m = await sharp(buf, { failOn: "none" }).metadata();
  return `${m.width}x${m.height}`;
}

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)}MB`;

// -------------------------------------------------------------------

async function main() {
  console.log("========================================");
  console.log(EXECUTE && CONFIRMED ? "EXECUTE 모드 (메타데이터 실제 변경)" : "DRY RUN 모드 (변경 없음)");
  console.log(`Bucket: ${BUCKET} / Region: ${AWS_REGION}`);
  console.log("========================================\n");

  if (EXECUTE && !CONFIRMED) {
    console.error("--execute 만으로는 변경하지 않는다. --confirm-metadata 를 함께 지정할 것.");
    process.exit(1);
  }

  const inUse = await inUseImageKeys();
  const all = await listAllObjects();
  const targets = all.filter((o) => inUse.has(o.key));
  console.log(`전체 객체 ${all.length}개 중 사용 중인 대상 ${targets.length}개 (고아 후보 ${all.length - targets.length}개 제외)\n`);

  console.log("객체 메타데이터/시그니처 조회 중...");
  const inspected = await mapLimit(targets, 16, (o) => inspect(o.key, o.size));

  // ---- 집계 ----
  const byContentType = new Map<string, number>();
  const byDetected = new Map<string, number>();
  let noCacheControl = 0;
  let extMismatch = 0;
  let multipart = 0;
  const undetected: Target[] = [];
  const storageClasses = new Map<string, number>();
  const encryption = new Map<string, number>();

  for (const t of inspected) {
    byContentType.set(t.contentType ?? "(없음)", (byContentType.get(t.contentType ?? "(없음)") ?? 0) + 1);
    const det = t.detected ?? "감지 실패";
    byDetected.set(det, (byDetected.get(det) ?? 0) + 1);
    if (!t.cacheControl) noCacheControl++;
    if (t.detected && t.detected !== "jpeg" && /\.jpe?g$/i.test(t.key)) extMismatch++;
    if ((t.etag ?? "").includes("-")) multipart++;
    if (!t.detected) undetected.push(t);
    storageClasses.set(t.storageClass!, (storageClasses.get(t.storageClass!) ?? 0) + 1);
    const enc = t.kmsKeyId ? `${t.sse} (KMS)` : (t.sse ?? "없음");
    encryption.set(enc, (encryption.get(enc) ?? 0) + 1);
  }

  const changeable = inspected.filter((t) => t.detected !== null);
  const needsChange = changeable.filter(
    (t) => t.contentType !== FORMAT_CONTENT_TYPE[t.detected!] || t.cacheControl !== TARGET_CACHE_CONTROL
  );

  console.log("\n--- dry-run 보고 ---");
  console.log(`1. 처리 대상 참조 객체 수     : ${inspected.length}개 / ${mb(inspected.reduce((a, b) => a + b.size, 0))}`);
  console.log("2. 현재 Content-Type별 객체 수:");
  for (const [k, v] of [...byContentType].sort((a, b) => b[1] - a[1])) console.log(`     ${k.padEnd(28)} ${v}개`);
  console.log("3. 실제 감지 포맷별 객체 수:");
  for (const [k, v] of [...byDetected].sort((a, b) => b[1] - a[1])) console.log(`     ${k.padEnd(28)} ${v}개`);
  console.log(`4. 확장자와 실제 포맷 불일치  : ${extMismatch}개 (.jpg 키인데 실제는 다른 포맷)`);
  console.log(`5. Cache-Control 없는 객체    : ${noCacheControl}개`);
  console.log("6. 변경 예정 Content-Type:");
  const plan = new Map<string, number>();
  for (const t of needsChange) {
    const k = `${t.contentType ?? "(없음)"} -> ${FORMAT_CONTENT_TYPE[t.detected!]}`;
    plan.set(k, (plan.get(k) ?? 0) + 1);
  }
  for (const [k, v] of [...plan].sort((a, b) => b[1] - a[1])) console.log(`     ${k.padEnd(50)} ${v}개`);
  console.log(`7. 변경 예정 Cache-Control    : (없음) -> ${TARGET_CACHE_CONTROL}  ${noCacheControl}개`);
  console.log(`8. 타입 감지 실패 객체        : ${undetected.length}개 (변경 대상에서 제외)`);
  for (const t of undetected.slice(0, 30)) console.log(`     ${t.key}  head=${t.signatureHex}`);
  console.log(`9. 예상 CopyObject 요청 수    : ${needsChange.length}건`);

  let versioning = "확인 불가";
  try {
    const v = await s3.send(new GetBucketVersioningCommand({ Bucket: BUCKET }));
    versioning = v.Status ?? "Disabled (미설정)";
  } catch (err) {
    versioning = `확인 불가 (${(err as Error).name} — IAM에 s3:GetBucketVersioning 필요)`;
  }
  console.log(`10. 버킷 버전 관리 상태       : ${versioning}`);
  const changeSize = needsChange.reduce((a, b) => a + b.size, 0);
  console.log(`11. 버전 관리 활성 시 추가 용량: 최대 ${mb(changeSize)} (변경 대상 전량이 새 버전으로 복제될 경우)`);
  console.log("12. 기존 설정 보존 확인:");
  for (const [k, v] of storageClasses) console.log(`     Storage Class ${k.padEnd(16)} ${v}개 → 동일 값으로 복사`);
  for (const [k, v] of encryption) console.log(`     암호화 ${k.padEnd(22)} ${v}개 → 동일 설정으로 복사`);
  const withMeta = inspected.filter((t) => Object.keys(t.metadata).length > 0).length;
  console.log(`     사용자 정의 Metadata 보유 ${withMeta}개 → 그대로 재기록`);
  console.log(`     멀티파트 업로드 객체 ${multipart}개 (ETag 검증 시 참고)`);

  let tagSupported = true;
  try {
    await s3.send(new GetObjectTaggingCommand({ Bucket: BUCKET, Key: inspected[0].key }));
  } catch (err) {
    tagSupported = false;
    console.log(`     객체 태그 조회 불가 (${(err as Error).name}) — CopyObject의 TaggingDirective 기본값 COPY로 보존됨`);
  }
  if (tagSupported) console.log("     객체 태그 → TaggingDirective=COPY 로 보존");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const planPath = path.join(OUT_DIR, `metadata-plan-${stamp}.json`);
  fs.writeFileSync(
    planPath,
    JSON.stringify(
      {
        bucket: BUCKET,
        generatedAt: new Date().toISOString(),
        targetCacheControl: TARGET_CACHE_CONTROL,
        undetected: undetected.map((t) => ({ key: t.key, head: t.signatureHex })),
        changes: needsChange.map((t) => ({
          key: t.key,
          from: { contentType: t.contentType, cacheControl: t.cacheControl },
          to: { contentType: FORMAT_CONTENT_TYPE[t.detected!], cacheControl: TARGET_CACHE_CONTROL },
          storageClass: t.storageClass,
          sse: t.sse,
          size: t.size,
          etag: t.etag,
        })),
      },
      null,
      2
    )
  );
  console.log(`\n계획 파일: ${planPath}`);

  if (!EXECUTE || !CONFIRMED) {
    console.log("\nDRY RUN 종료. 실제 적용은 --execute --confirm-metadata 필요.");
    return;
  }

  // -----------------------------------------------------------------
  // 실제 적용
  // -----------------------------------------------------------------
  const samples = needsChange.slice(0, Math.min(SAMPLE_SIZE, needsChange.length));
  console.log(`\n샘플 ${samples.length}개 사전 해시/해상도 기록 중...`);
  const before = new Map<string, { sha256: string; length: number; dims: string }>();
  for (const t of samples) {
    const h = await fullHash(t.key);
    before.set(t.key, { ...h, dims: await imageDimensions(t.key) });
  }

  console.log(`\nCopyObject 시작: ${needsChange.length}건`);
  const done: string[] = [];
  const failed: { key: string; reason: string }[] = [];

  await mapLimit(needsChange, 8, async (t) => {
    try {
      await s3.send(
        new CopyObjectCommand({
          Bucket: BUCKET,
          Key: t.key,
          CopySource: `${BUCKET}/${encodeURIComponent(t.key)}`,
          MetadataDirective: "REPLACE",
          ContentType: FORMAT_CONTENT_TYPE[t.detected!],
          CacheControl: TARGET_CACHE_CONTROL,
          // REPLACE는 사용자 정의 Metadata도 지우므로 기존 값을 다시 넣어준다.
          Metadata: t.metadata,
          // 기본값(STANDARD/버킷 기본 암호화)으로 떨어지지 않도록 원래 설정을 명시한다.
          StorageClass: t.storageClass as StorageClass | undefined,
          ServerSideEncryption: t.sse as ServerSideEncryption | undefined,
          SSEKMSKeyId: t.kmsKeyId,
          // 태그는 기본 TaggingDirective=COPY 로 보존된다. ACL은 지정하지 않는다.
        })
      );
      done.push(t.key);
    } catch (err) {
      failed.push({ key: t.key, reason: `${(err as Error).name}: ${(err as Error).message}` });
    }
  });

  console.log(`완료: 성공 ${done.length} / 실패 ${failed.length}`);

  // ---- 검증 ----
  console.log("\n--- 검증 ---");
  const beforeByKey = new Map(inspected.map((t) => [t.key, t]));
  const recheck = await mapLimit(done.slice(0, Math.min(200, done.length)), 16, (key) =>
    s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key, ChecksumMode: "ENABLED" })).then((h) => ({ key, h }))
  );

  let lenMismatch = 0;
  let etagMismatch = 0;
  let ctWrong = 0;
  let ccWrong = 0;
  let scChanged = 0;
  let sseChanged = 0;
  let metaLost = 0;
  for (const { key, h } of recheck) {
    const b = beforeByKey.get(key)!;
    if (h.ContentLength !== b.size) lenMismatch++;
    if (b.etag && h.ETag !== b.etag) etagMismatch++;
    if (h.ContentType !== FORMAT_CONTENT_TYPE[b.detected!]) ctWrong++;
    if (h.CacheControl !== TARGET_CACHE_CONTROL) ccWrong++;
    if ((h.StorageClass ?? "STANDARD") !== b.storageClass) scChanged++;
    if ((h.ServerSideEncryption ?? "") !== (b.sse ?? "")) sseChanged++;
    if (Object.keys(b.metadata).length !== Object.keys(h.Metadata ?? {}).length) metaLost++;
  }
  console.log(`  HeadObject 재확인 ${recheck.length}건`);
  console.log(`  Content-Length 불일치 : ${lenMismatch}  ${lenMismatch === 0 ? "OK" : "*** 확인 필요 ***"}`);
  console.log(`  ETag 불일치           : ${etagMismatch}  ${etagMismatch === 0 ? "OK (바이트 동일)" : "*** 확인 필요 ***"}`);
  console.log(`  Content-Type 미적용   : ${ctWrong}  ${ctWrong === 0 ? "OK" : "*** 확인 필요 ***"}`);
  console.log(`  Cache-Control 미적용  : ${ccWrong}  ${ccWrong === 0 ? "OK" : "*** 확인 필요 ***"}`);
  console.log(`  Storage Class 변동    : ${scChanged}  ${scChanged === 0 ? "OK" : "*** 확인 필요 ***"}`);
  console.log(`  암호화 설정 변동      : ${sseChanged}  ${sseChanged === 0 ? "OK" : "*** 확인 필요 ***"}`);
  console.log(`  사용자 Metadata 유실  : ${metaLost}  ${metaLost === 0 ? "OK" : "*** 확인 필요 ***"}`);

  console.log(`\n  샘플 ${samples.length}개 실제 바이트 해시/해상도 비교:`);
  for (const t of samples) {
    if (!done.includes(t.key)) continue;
    const b = before.get(t.key)!;
    const a = await fullHash(t.key);
    const dims = await imageDimensions(t.key);
    const ok = a.sha256 === b.sha256 && a.length === b.length && dims === b.dims;
    console.log(`    ${ok ? "OK  " : "FAIL"} ${t.key} len ${b.length}->${a.length} dims ${b.dims}->${dims}`);
  }

  const resultPath = path.join(OUT_DIR, `metadata-result-${stamp}.json`);
  fs.writeFileSync(resultPath, JSON.stringify({ done, failed }, null, 2));
  console.log(`\n결과 파일: ${resultPath}`);
  if (failed.length > 0) console.log("실패 객체는 동일 명령 재실행 시 자동으로 재시도된다 (정상 객체는 건너뜀).");
}

main().catch((e) => {
  console.error("실패:", e);
  process.exit(1);
});
