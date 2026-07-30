import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  NotFound,
} from "@aws-sdk/client-s3";
import { getSupabase } from "@/lib/supabase";
import { optimizeImage, MAX_SOURCE_BYTES, type ImagePreset } from "@/lib/image";
import { runImageJob } from "@/lib/imageQueue";
import { randomUUID } from "crypto";

// 신규 업로드 객체에 적용하는 캐시 정책.
// 이미지 ID가 바뀌면 키도 바뀌므로(덮어쓰기 없음) immutable을 안전하게 쓸 수 있다.
export const IMAGE_CACHE_CONTROL = "public, max-age=31536000, immutable";

function pickEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function requireEnv(...names: string[]): string {
  const value = pickEnv(...names);
  if (!value) {
    throw new Error(
      `Missing required environment variable. Provide one of: ${names.join(", ")}`
    );
  }
  return value;
}

let s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (s3Client) return s3Client;

  const region = pickEnv("AWS_REGION") ?? "ap-northeast-2";
  const accessKeyId = pickEnv("AWS_ACCESS_KEY_ID");
  const secretAccessKey = pickEnv("AWS_SECRET_ACCESS_KEY");

  // If explicit credentials are not provided, AWS SDK will use its default chain
  // (e.g., IAM Role / ECS / EKS / local shared config if enabled).
  s3Client = new S3Client(
    accessKeyId && secretAccessKey
      ? { region, credentials: { accessKeyId, secretAccessKey } }
      : { region }
  );
  return s3Client;
}

function getBucketName(): string {
  return requireEnv("AWS_BUCKET_NAME", "AWS_BUCKET", "S3_BUCKET_NAME", "S3_BUCKET");
}

// 이미지 ID와 S3 키는 1:1이다. 별도 매핑 조회 없이 키를 구성할 수 있도록,
// 키 생성 규칙을 한 곳에서만 정의한다.
export function imageKey(imageId: string): string {
  return `${imageId}.jpg`;
}

export function buildImageUrl(imageId: string | null | undefined): string | null {
  if (!imageId) return null;
  const base = pickEnv("IMAGE_CDN_BASE_URL");
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/${imageKey(imageId)}`;
}

/** 최적화가 끝난 JPEG 버퍼를 S3에 올리고 images 테이블에 등록한다. */
export async function storeOptimizedImage(
  optimized: Buffer
): Promise<{ imageId: string; filePath: string }> {
  const s3 = getS3Client();
  const bucket = getBucketName();
  // 항상 새 UUID를 발급한다. 기존 객체를 덮어쓰지 않으므로 CloudFront 캐시가
  // 예전 이미지를 들고 있어도 새 이미지와 섞이지 않는다.
  const imageId = randomUUID();
  const key = imageKey(imageId);

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: optimized,
      ContentType: "image/jpeg",
      CacheControl: IMAGE_CACHE_CONTROL,
    })
  );

  const { data, error } = await getSupabase()
    .from("images")
    .insert({ image_id: imageId, file_path: key })
    .select("image_id")
    .single();

  if (error || !data) {
    // DB에 남지 않는 객체는 고아가 되므로 방금 올린 것만 되돌린다.
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch (err) {
      console.error("Failed to roll back orphaned S3 object:", key, err);
    }
    throw new Error("Failed to save image record");
  }

  return { imageId: data.image_id as string, filePath: key };
}

export async function uploadImageAndSave(
  buffer: Buffer,
  preset: ImagePreset
): Promise<{ imageId: string; filePath: string }> {
  const optimized = await runImageJob(() => optimizeImage(buffer, preset));
  return storeOptimizedImage(optimized);
}

/** 동적 이미지 라우트가 읽는 원본. 없으면 null, 너무 크면 예외. */
export class SourceImageTooLargeError extends Error {
  constructor(size: number) {
    super(`Source object exceeds ${MAX_SOURCE_BYTES} bytes (${size})`);
    this.name = "SourceImageTooLargeError";
  }
}

export async function getImageObject(imageId: string): Promise<Buffer | null> {
  const s3 = getS3Client();
  const bucket = getBucketName();

  let res;
  try {
    res = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: imageKey(imageId) })
    );
  } catch (err) {
    if (err instanceof NoSuchKey || err instanceof NotFound) return null;
    // AccessDenied 등 다른 오류는 상위에서 500으로 처리한다.
    throw err;
  }

  // 본문을 읽기 전에 크기를 확인해, 예상보다 큰 객체로 메모리를 소모하지 않는다.
  const length = res.ContentLength ?? 0;
  if (length > MAX_SOURCE_BYTES) {
    res.Body?.transformToWebStream().cancel().catch(() => undefined);
    throw new SourceImageTooLargeError(length);
  }
  if (!res.Body) return null;

  return Buffer.from(await res.Body.transformToByteArray());
}

export async function deleteImageById(imageId: string): Promise<void> {
  const s3 = getS3Client();
  const bucket = getBucketName();
  const { data } = await getSupabase()
    .from("images")
    .select("file_path")
    .eq("image_id", imageId)
    .single();

  if (data?.file_path) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: data.file_path }));
    } catch {
      // S3 삭제 실패는 무시
    }
  }

  await getSupabase()
    .from("images")
    .update({ deleted_at: new Date().toISOString() })
    .eq("image_id", imageId);
}
