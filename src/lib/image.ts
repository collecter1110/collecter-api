import sharp, { type Metadata } from "sharp";
import { runImageJob } from "@/lib/imageQueue";

export type ImagePreset = {
  maxSize: number;
  quality: number;
};

// 신규 업로드 시 S3에 저장하는 "기준 이미지" 규격.
// 화면별 크기는 저장하지 않고 /t/{imageId}.jpg?w= 에서 온디맨드로 만든다.
export const PROFILE_IMAGE_PRESET: ImagePreset = { maxSize: 800, quality: 80 };
export const SELECTION_IMAGE_PRESET: ImagePreset = { maxSize: 1600, quality: 82 };

// 투명 PNG/WebP를 JPEG로 변환할 때 알파 영역을 채우는 색.
// 지정하지 않으면 sharp가 검은색으로 채워서 사진이 까맣게 보인다.
// 업로드 최적화와 동적 리사이즈가 반드시 같은 값을 써야 결과가 일관된다.
export const JPEG_FLATTEN_BACKGROUND = "#ffffff";

// 입력 제한. 컨테이너 메모리를 보호하기 위한 값이며 초과 시 400으로 거부한다.
// 60MP는 iPhone 48MP(8064x6048=48.8MP) 촬영본을 통과시키기 위한 값이다.
export const MAX_INPUT_BYTES = 15 * 1024 * 1024;
export const MAX_INPUT_PIXELS = 60_000_000;

// 동적 리사이즈가 S3에서 읽어들이는 원본 상한.
// 현재 참조 객체 최대치가 10.08MB이므로 여유를 두되 무제한으로 열지 않는다.
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

const SUPPORTED_INPUT_FORMATS = new Set([
  "jpeg",
  "png",
  "webp",
  "heif", // sharp는 HEIC/HEIF/AVIF를 모두 "heif"로 보고한다
  "gif",
  "tiff",
  "avif",
]);

// 동적 이미지 라우트가 허용하는 너비와 각 너비의 출력 품질.
export const SUPPORTED_WIDTHS = [128, 320, 640, 1280] as const;
export type SupportedWidth = (typeof SUPPORTED_WIDTHS)[number];

const WIDTH_QUALITY: Record<SupportedWidth, number> = {
  128: 75,
  320: 78,
  640: 80,
  1280: 82,
};

export function parseSupportedWidth(raw: string | null): SupportedWidth | null {
  if (raw === null) return null;
  // "0320", " 320", "320px" 같은 값을 통과시키지 않기 위해 문자열을 그대로 비교한다.
  const match = SUPPORTED_WIDTHS.find((w) => String(w) === raw);
  return match ?? null;
}

/** 이미지로 디코딩할 수 없거나 지원하지 않는 포맷 (→ 400) */
export class InvalidImageError extends Error {
  constructor(cause?: unknown) {
    super("Unsupported or corrupted image file");
    this.name = "InvalidImageError";
    this.cause = cause;
  }
}

/** 파일 크기 또는 픽셀 수 제한 초과 (→ 400) */
export class ImageTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageTooLargeError";
  }
}

export function isRejectableImageError(err: unknown): boolean {
  return err instanceof InvalidImageError || err instanceof ImageTooLargeError;
}

type ProbeResult = {
  width: number;
  height: number;
  format: string;
};

// 클라이언트가 보낸 MIME 타입과 확장자를 신뢰하지 않고, 실제 바이트를 디코딩해
// 포맷과 크기를 확인한다. 여기서 통과하지 못하면 어떤 경우에도 S3에 올리지 않는다.
async function probe(input: Buffer): Promise<ProbeResult> {
  let metadata: Metadata;
  try {
    // metadata()는 헤더만 읽고 픽셀을 디코딩하지 않는다. 여기서 픽셀 상한을 걸면
    // "너무 큼"과 "손상됨"을 구분할 수 없으므로, 크기 판정은 아래에서 직접 한다.
    metadata = await sharp(input, {
      failOn: "error",
      limitInputPixels: false,
    }).metadata();
  } catch (err) {
    throw new InvalidImageError(err);
  }

  const { format, width, height } = metadata;
  if (!format || !SUPPORTED_INPUT_FORMATS.has(format)) {
    throw new InvalidImageError(`unsupported format: ${format ?? "unknown"}`);
  }
  if (!width || !height) {
    throw new InvalidImageError("missing image dimensions");
  }
  if (width * height > MAX_INPUT_PIXELS) {
    throw new ImageTooLargeError(
      `image exceeds ${MAX_INPUT_PIXELS} pixels (${width}x${height})`
    );
  }
  return { width, height, format };
}

// 업로드된 이미지를 프리셋 크기에 맞춰 축소하고 JPEG로 재인코딩한다.
// 결과는 항상 image/jpeg이므로 S3 키의 .jpg 확장자와 일치한다.
// sharp는 withMetadata()를 호출하지 않으면 EXIF를 출력에 복사하지 않으므로
// GPS를 포함한 메타데이터는 이 단계에서 모두 제거된다.
export async function optimizeImage(
  input: Buffer,
  preset: ImagePreset
): Promise<Buffer> {
  if (input.length > MAX_INPUT_BYTES) {
    throw new ImageTooLargeError(
      `image exceeds ${MAX_INPUT_BYTES} bytes (${input.length})`
    );
  }
  await probe(input);

  try {
    return await sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      // EXIF orientation을 픽셀에 반영. 이후 메타데이터가 제거되므로
      // 이 단계가 없으면 아이폰 사진이 눕거나 뒤집힌 채로 저장된다.
      .rotate()
      .flatten({ background: JPEG_FLATTEN_BACKGROUND })
      .resize({
        width: preset.maxSize,
        height: preset.maxSize,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: preset.quality })
      .toBuffer();
  } catch (err) {
    throw new InvalidImageError(err);
  }
}

/**
 * 업로드된 파일들을 순차로 검증·최적화한다.
 *
 * 호출부는 이 함수가 성공한 뒤에 DB를 변경해야 한다. 그래야 잘못된 이미지로
 * 400을 반환할 때 절반만 만들어진 레코드가 남지 않는다.
 * 여러 장을 동시에 디코딩하면 메모리 피크가 장수만큼 커지므로 순차 처리한다.
 */
export async function optimizeUploadedImages(
  files: File[],
  preset: ImagePreset
): Promise<Buffer[]> {
  const usable = files.filter((f) => f && f.size > 0);
  const optimized: Buffer[] = [];

  for (const file of usable) {
    // 버퍼로 읽기 전에 크기부터 확인해, 큰 파일을 메모리에 올리지 않고 거부한다.
    if (file.size > MAX_INPUT_BYTES) {
      throw new ImageTooLargeError(
        `image exceeds ${MAX_INPUT_BYTES} bytes (${file.size})`
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    optimized.push(await runImageJob(() => optimizeImage(buffer, preset)));
  }

  return optimized;
}

// 동적 이미지 라우트용. S3에 저장된 기준 이미지를 요청 너비로 축소한다.
// 기존 이미지와 신규 이미지를 구분하지 않고, 저장된 Content-Type과도 무관하게
// 실제 바이트를 디코딩한다(레거시 객체 중 215개는 .jpg 키에 PNG 바이트다).
export async function resizeToWidth(
  source: Buffer,
  width: SupportedWidth
): Promise<Buffer> {
  try {
    return await sharp(source, {
      // 저장된 객체는 이미 업로드 시점에 검증을 통과했거나 레거시 마이그레이션
      // 대상이므로, 사소한 경고로 기존 이미지가 깨지지 않도록 관대하게 읽는다.
      failOn: "none",
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      .flatten({ background: JPEG_FLATTEN_BACKGROUND })
      .resize({
        width,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: WIDTH_QUALITY[width] })
      .toBuffer();
  } catch (err) {
    throw new InvalidImageError(err);
  }
}
