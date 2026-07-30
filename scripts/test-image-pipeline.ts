import sharp from "sharp";
import {
  optimizeImage,
  optimizeUploadedImages,
  PROFILE_IMAGE_PRESET,
  SELECTION_IMAGE_PRESET,
  InvalidImageError,
  ImageTooLargeError,
} from "../src/lib/image";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  ok ? pass++ : fail++;
}
async function expectThrow(name: string, fn: () => Promise<unknown>, type: Function) {
  try {
    await fn();
    check(name, false, "예외가 발생하지 않음");
  } catch (e) {
    check(name, e instanceof type, (e as Error).name);
  }
}

async function main() {
  // --- 크기 규격 ---
  const big = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#3366cc" } })
    .jpeg().toBuffer();

  const p = await sharp(await optimizeImage(big, PROFILE_IMAGE_PRESET)).metadata();
  check("프로필 최대 800px", p.width === 800 && p.height === 533, `${p.width}x${p.height} ${p.format}`);

  const s = await sharp(await optimizeImage(big, SELECTION_IMAGE_PRESET)).metadata();
  check("셀렉션/컬렉션 최대 1600px", s.width === 1600 && s.height === 1067, `${s.width}x${s.height} ${s.format}`);
  check("출력 포맷 JPEG", s.format === "jpeg" && p.format === "jpeg");

  // --- 작은 이미지 확대 금지 ---
  const small = await sharp({ create: { width: 100, height: 120, channels: 3, background: "#ff0000" } }).jpeg().toBuffer();
  const sm = await sharp(await optimizeImage(small, PROFILE_IMAGE_PRESET)).metadata();
  check("작은 이미지 확대 안 함", sm.width === 100 && sm.height === 120, `${sm.width}x${sm.height}`);

  // --- 세로 이미지 + EXIF 방향 보정 ---
  const portrait = await sharp({ create: { width: 400, height: 900, channels: 3, background: "#00ff00" } }).jpeg().toBuffer();
  const pt = await sharp(await optimizeImage(portrait, SELECTION_IMAGE_PRESET)).metadata();
  check("세로 이미지 비율 유지", pt.width === 400 && pt.height === 900, `${pt.width}x${pt.height}`);

  // orientation=6(시계방향 90도 회전 필요) 이미지는 픽셀이 회전되어 나와야 한다
  const rotated = await sharp({ create: { width: 800, height: 400, channels: 3, background: "#0000ff" } })
    .withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const rt = await sharp(await optimizeImage(rotated, SELECTION_IMAGE_PRESET)).metadata();
  check("EXIF 방향 보정 적용", rt.width === 400 && rt.height === 800, `${rt.width}x${rt.height}`);

  // --- 투명 이미지 배경 ---
  const transparent = await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .png().toBuffer();
  const flatOut = await optimizeImage(transparent, SELECTION_IMAGE_PRESET);
  const px = await sharp(flatOut).raw().toBuffer();
  const white = px[0] > 248 && px[1] > 248 && px[2] > 248;
  const fm = await sharp(flatOut).metadata();
  check("투명 영역 흰색 배경 (검은색 아님)", white, `rgb(${px[0]},${px[1]},${px[2]})`);
  check("투명 PNG -> JPEG 변환", fm.format === "jpeg" && !fm.hasAlpha);

  // --- 메타데이터 제거 ---
  const withGps = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#888" } })
    .withExif({
      IFD0: { Copyright: "collecter" },
      // GPS 태그가 결과물에 남지 않는지 확인하기 위한 입력. sharp 타입에는 없어 캐스팅한다.
      GPSIFD: { GPSLatitudeRef: "N", GPSLatitude: "37/1 30/1 0/1" },
    } as unknown as Parameters<ReturnType<typeof sharp>["withExif"]>[0])
    .jpeg().toBuffer();
  const beforeMeta = await sharp(withGps).metadata();
  const afterMeta = await sharp(await optimizeImage(withGps, PROFILE_IMAGE_PRESET)).metadata();
  check("EXIF/GPS 제거", !!beforeMeta.exif && !afterMeta.exif, `before=${!!beforeMeta.exif} after=${!!afterMeta.exif}`);

  // --- 거부 케이스 ---
  await expectThrow("이미지가 아닌 파일 거부", () => optimizeImage(Buffer.from("this is not an image at all"), PROFILE_IMAGE_PRESET), InvalidImageError);
  await expectThrow("손상된 이미지 거부", () => optimizeImage(big.subarray(0, Math.floor(big.length / 3)), PROFILE_IMAGE_PRESET), InvalidImageError);
  await expectThrow("최대 파일 크기(15MB) 초과 거부", () => optimizeImage(Buffer.alloc(16 * 1024 * 1024, 1), PROFILE_IMAGE_PRESET), ImageTooLargeError);

  const huge = await sharp({ create: { width: 9000, height: 7000, channels: 3, background: "#101010" } })
    .jpeg({ quality: 40 }).toBuffer();
  console.log(`  (63MP 테스트 파일 ${(huge.length / 1024 / 1024).toFixed(1)}MB)`);
  await expectThrow("최대 픽셀 수(60MP) 초과 거부", () => optimizeImage(huge, SELECTION_IMAGE_PRESET), ImageTooLargeError);

  // 48MP(아이폰 최대 해상도)는 통과해야 한다
  const iphone48 = await sharp({ create: { width: 8064, height: 6048, channels: 3, background: "#202020" } })
    .jpeg({ quality: 40 }).toBuffer();
  const ip = await sharp(await optimizeImage(iphone48, SELECTION_IMAGE_PRESET)).metadata();
  check("아이폰 48MP 촬영본 통과", ip.width === 1600, `${ip.width}x${ip.height}`);

  // --- 다중 업로드 헬퍼 ---
  const files = [
    new File([new Uint8Array(big)], "a.jpg", { type: "image/jpeg" }),
    new File([new Uint8Array(small)], "b.png", { type: "image/png" }), // 실제로는 JPEG 바이트 (MIME 신뢰 안 함)
    new File([], "empty.jpg", { type: "image/jpeg" }),
  ];
  const many = await optimizeUploadedImages(files, SELECTION_IMAGE_PRESET);
  check("빈 파일 제외하고 최적화", many.length === 2, `${many.length}개`);

  const badFiles = [new File([new Uint8Array(big)], "a.jpg"), new File([new Uint8Array(Buffer.from("nope"))], "bad.jpg")];
  await expectThrow("한 장이라도 잘못되면 전체 거부", () => optimizeUploadedImages(badFiles, SELECTION_IMAGE_PRESET), InvalidImageError);

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
