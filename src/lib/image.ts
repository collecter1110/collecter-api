import sharp from "sharp";

export type ImagePreset = {
  maxSize: number;
  quality: number;
};

export const PROFILE_IMAGE_PRESET: ImagePreset = { maxSize: 800, quality: 80 };
export const SELECTION_IMAGE_PRESET: ImagePreset = { maxSize: 1600, quality: 82 };

export class InvalidImageError extends Error {
  constructor(cause?: unknown) {
    super("Unsupported or corrupted image file");
    this.name = "InvalidImageError";
    this.cause = cause;
  }
}

// 업로드된 이미지를 프리셋 크기에 맞춰 축소하고 JPEG로 재인코딩한다.
// 결과는 항상 image/jpeg이므로 S3 키의 .jpg 확장자와 일치한다.
export async function optimizeImage(
  input: Buffer,
  preset: ImagePreset
): Promise<Buffer> {
  try {
    return await sharp(input, { failOn: "none" })
      // EXIF orientation을 픽셀에 반영. 이후 메타데이터가 제거되므로
      // 이 단계가 없으면 아이폰 사진이 눕거나 뒤집힌 채로 저장된다.
      .rotate()
      // 알파 채널이 있는 이미지는 JPEG 변환 시 투명 영역이 검게 나오므로 흰색으로 채운다.
      .flatten({ background: "#ffffff" })
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
