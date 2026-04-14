/**
 * 마이그레이션 실패한 셀렉션 이미지가 S3에 존재하는지 확인
 */
import { S3Client, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
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

const failures = [
  { userId: 70, collId: 215, selId: 1, file: "image_picker_0792EB9C-E6E1-4B88-8A39-1C655D4DD66E-11085-000001B73ADA1EBC.jpg" },
  { userId: 64, collId: 221, selId: 2, file: "image_picker_BAFF158F-DBD8-4C47-8802-15BF001CBBF3-11085-000001C3E9A36B2C.png" },
  { userId: 64, collId: 221, selId: 3, file: "image_picker_18F68FCF-5D3E-4057-B102-ED3D02A8D407-11085-000001BB999493E2.png" },
  { userId: 69, collId: 224, selId: 5, file: "image_picker_AE4819C6-7EC0-47F7-98DF-7B44647FAEFD-7485-0000034812A22F55.jpg" },
  { userId: 70, collId: 256, selId: 1, file: "image_picker_B1564F80-40E3-45E0-8839-CF6B0CD0DC85-26063-00000B52CA7D7FA2.jpg" },
  { userId: 70, collId: 256, selId: 2, file: "image_picker_E0888889-2BAF-4AC6-AF65-A48FFB26F9FD-28357-00000C615E6187FB.jpg" },
  { userId: 69, collId: 267, selId: 25, file: "image_picker_7F54B94E-5D6E-4B45-909E-2EA8FCF61475-12490-000001689CB74C01.jpg" },
  { userId: 69, collId: 267, selId: 26, file: "image_picker_10B0CDBB-C424-4D21-8A41-B7D7F9F74DD2-636-00000007F6430C1B.jpg" },
  { userId: 69, collId: 381, selId: 5, file: "image_picker_B1564F80-40E3-45E0-8839-CF6B0CD0DC85-26063-00000B52CA7D7FA2.jpg" },
  { userId: 279, collId: 446, selId: 20, file: "image_picker_37256C3F-AE6E-40FB-9ACF-CB9D2021647B-29953-00000518A065E39A.jpg" },
  { userId: 279, collId: 447, selId: 11, file: "image_picker_44A66827-DBA6-4374-8250-F244272C8F6B-62078-00000ABC944A3AF6.jpg" },
  { userId: 279, collId: 447, selId: 12, file: "image_picker_7B75C2C1-32FA-429C-965E-35A37B45CBF7-12758-000001F726B6F435.jpg" },
  { userId: 293, collId: 456, selId: 1, file: "image_picker_D5C28C7B-D1F0-4F12-8690-B32B91FCE3AB-4255-000000D7C9147AEC.jpg" },
  { userId: 293, collId: 456, selId: 2, file: "image_picker_244D19CA-A04F-4C57-BB57-1A2D66EFBFAD-2086-0000003BADCA6204.jpg" },
  { userId: 293, collId: 456, selId: 3, file: "image_picker_290FEDCD-C912-4DB2-BDF5-89E9DC21C66F-4558-000000E5D95910AC.jpg" },
  { userId: 293, collId: 456, selId: 4, file: "image_picker_564705BA-C38D-4358-BD99-D8A73D7EA26B-11278-000005EFC8702EBE.jpg" },
  { userId: 293, collId: 456, selId: 5, file: "image_picker_22B13DBF-4CB1-4901-AE95-6FE67D126903-4558-000000E0D5D4A898.jpg" },
  { userId: 293, collId: 456, selId: 6, file: "image_picker_B54FA18E-D0F4-4B1A-9AAF-117A62A6FCED-4558-000001236B42B1AB.jpg" },
  { userId: 293, collId: 456, selId: 7, file: "image_picker_7B9BB0F6-8188-455A-A6C3-36AA6AEE310B-2134-0000003CD23DBED1.jpg" },
  { userId: 302, collId: 471, selId: 1, file: "image_picker_D182DB3A-B60C-45ED-B7E7-9730C272E2E1-32390-0000055CF63BCFBB.jpg" },
  { userId: 349, collId: 525, selId: 2, file: "image_picker_F409773B-1987-46B0-93FC-D5E8CCBF7903-2933-000020A0BE3363D5.jpg" },
];

async function checkExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function searchByPrefix(userId: number, filename: string): Promise<string | null> {
  // userId 폴더 전체에서 파일명으로 검색
  try {
    const { Contents } = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: `${userId}/`,
    }));
    const match = (Contents ?? []).find((obj) => obj.Key?.endsWith(filename));
    return match?.Key ?? null;
  } catch {
    return null;
  }
}

async function main() {
  console.log(`Bucket: ${BUCKET}\n`);

  for (const f of failures) {
    const expectedKey = `${f.userId}/selections/${f.file}`;
    const exists = await checkExists(expectedKey);

    if (exists) {
      console.log(`✓ 존재: ${expectedKey}`);
    } else {
      // 예상 경로에 없으면 userId 폴더 전체에서 검색
      const found = await searchByPrefix(f.userId, f.file);
      if (found) {
        console.log(`⚠ 다른 경로에 존재: coll=${f.collId} sel=${f.selId} → ${found}`);
      } else {
        console.log(`❌ S3에 없음: coll=${f.collId} sel=${f.selId} → ${expectedKey}`);
      }
    }
  }
}

main().catch(console.error);
