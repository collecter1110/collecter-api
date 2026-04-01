import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSupabase } from "@/lib/supabase";
import { randomUUID } from "crypto";

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

export async function uploadImageAndSave(
  buffer: Buffer,
  contentType: string,
  folder: string
): Promise<{ imageId: string; filePath: string }> {
  const s3 = getS3Client();
  const bucket = getBucketName();
  const ext = contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const key = `${folder}/${randomUUID()}.${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  const { data, error } = await getSupabase()
    .from("images")
    .insert({ file_path: key })
    .select("image_id")
    .single();

  if (error || !data) throw new Error("Failed to save image record");

  return { imageId: data.image_id as string, filePath: key };
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
