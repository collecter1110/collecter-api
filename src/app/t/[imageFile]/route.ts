import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import {
  resizeToWidth,
  parseSupportedWidth,
  InvalidImageError,
  ImageTooLargeError,
} from "@/lib/image";
import {
  getImageObject,
  SourceImageTooLargeError,
  IMAGE_CACHE_CONTROL,
} from "@/lib/storage";
import {
  runImageJob,
  QueueOverflowError,
  ImageTimeoutError,
} from "@/lib/imageQueue";

// sharp가 필요하므로 Node 런타임에서만 동작한다. 응답을 프레임워크가 캐시하지
// 않도록 강제한다 — 캐시는 CloudFront 한 곳에서만 담당한다.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /t/{imageId}.jpg?w={128|320|640|1280}
 *
 * CloudFront /t/* 비헤이비어가 이 라우트로 요청을 넘긴다.
 * 결과는 S3에 저장하지 않고 CloudFront 캐시에만 남는다.
 * 기존 이미지와 신규 이미지를 구분하지 않으며, S3 객체에 기록된 Content-Type과
 * 무관하게 실제 바이트를 디코딩한다.
 */

// 파일명 하나로 이미지 ID 형식과 확장자를 동시에 검증한다.
// 이 패턴은 소문자 UUID + ".jpg"만 통과시키므로 "/", "\", "..", null byte,
// URL 인코딩을 이용한 경로 우회, 내부 S3 경로 지정이 모두 자동으로 걸러진다.
const IMAGE_FILE_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jpg$/;

function errorResponse(status: number, code: string, retryAfter?: number) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    // 오류 응답은 절대 장기 캐시하지 않는다. CloudFront가 400/404/503을
    // 오래 들고 있으면 정상화된 뒤에도 계속 실패하게 된다.
    "Cache-Control": "no-store",
  };
  if (retryAfter) headers["Retry-After"] = String(retryAfter);
  // 내부 S3 키, 버킷 이름, AWS 오류 원문, 파일 경로, 스택은 노출하지 않는다.
  return new Response(JSON.stringify({ error: code }), { status, headers });
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// CloudFront가 Origin Custom Header로 붙이는 비밀 값을 확인한다.
// 값이 설정되지 않은 환경(로컬 개발)에서는 검사를 건너뛴다.
// 회전 중에는 콤마로 두 값을 나열해 구·신 비밀 값을 동시에 허용할 수 있다.
function isAllowedOrigin(request: NextRequest): boolean {
  const configured = process.env.IMAGE_ORIGIN_VERIFY_SECRET?.trim();
  if (!configured) return true;

  const provided = request.headers.get("x-image-origin-verify");
  if (!provided) return false;

  return configured
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .some((secret) => safeEqual(secret, provided));
}

type Params = { params: Promise<{ imageFile: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  if (!isAllowedOrigin(request)) {
    return errorResponse(403, "forbidden");
  }

  const { imageFile } = await params;
  const matched = IMAGE_FILE_PATTERN.exec(imageFile);
  if (!matched) {
    return errorResponse(400, "invalid_image_id");
  }
  const imageId = matched[1];

  const { searchParams } = request.nextUrl;
  // 캐시 키를 오염시키지 않도록 w 이외의 쿼리스트링은 받지 않는다.
  for (const key of searchParams.keys()) {
    if (key !== "w") return errorResponse(400, "unexpected_query");
  }
  if (searchParams.getAll("w").length > 1) {
    return errorResponse(400, "invalid_width");
  }
  // w가 없거나 허용 목록 밖이면 원본으로 폴백하지 않고 거부한다.
  const width = parseSupportedWidth(searchParams.get("w"));
  if (width === null) {
    return errorResponse(400, "invalid_width");
  }

  let source: Buffer | null;
  try {
    source = await getImageObject(imageId);
  } catch (err) {
    if (err instanceof SourceImageTooLargeError) {
      return errorResponse(413, "source_too_large");
    }
    console.error("t/[imageFile] source fetch failed:", imageId, err);
    return errorResponse(500, "internal_error");
  }
  if (!source) {
    return errorResponse(404, "not_found");
  }

  let output: Buffer;
  try {
    output = await runImageJob(() => resizeToWidth(source, width));
  } catch (err) {
    if (err instanceof QueueOverflowError || err instanceof ImageTimeoutError) {
      return errorResponse(503, "busy", 5);
    }
    if (err instanceof ImageTooLargeError) {
      return errorResponse(413, "source_too_large");
    }
    if (err instanceof InvalidImageError) {
      // 저장된 바이트를 디코딩하지 못한 경우. 요청 문제가 아니므로 500으로 알린다.
      console.error("t/[imageFile] decode failed:", imageId);
      return errorResponse(500, "internal_error");
    }
    console.error("t/[imageFile] resize failed:", imageId, err);
    return errorResponse(500, "internal_error");
  }

  return new Response(new Uint8Array(output), {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(output.length),
      "Cache-Control": IMAGE_CACHE_CONTROL,
    },
  });
}
