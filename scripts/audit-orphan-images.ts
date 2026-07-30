/**
 * 고아 이미지 검증 / 삭제 스크립트
 *
 * S3 전체 객체 키와 DB의 모든 이미지 참조를 대조해, 어디서도 참조되지 않는
 * 객체를 찾는다. 경로 모양(레거시 중첩 경로 등)으로 판단하지 않고 참조 유무로만
 * 판단한다.
 *
 *   tsx scripts/audit-orphan-images.ts                       # dry-run (기본)
 *   tsx scripts/audit-orphan-images.ts --execute --confirm-delete
 *   tsx scripts/audit-orphan-images.ts --execute --confirm-delete --from-file <json>
 *
 * --execute 하나만으로는 삭제되지 않는다. --confirm-delete 를 함께 줘야 한다.
 * 재실행 가능하며, 이미 삭제된 객체는 자동으로 건너뛴다.
 */

import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  GetBucketVersioningCommand,
  GetObjectCommand,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";

// --- 환경변수 로드 (.env.local) ---
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}

const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");
const CONFIRMED = args.includes("--confirm-delete");
const MARK_DB_DELETED = !args.includes("--no-mark-db-deleted");
const fromFileIdx = args.indexOf("--from-file");
const FROM_FILE = fromFileIdx >= 0 ? args[fromFileIdx + 1] : null;
const backupIdx = args.indexOf("--backup-dir");
const BACKUP_DIR = backupIdx >= 0 ? path.resolve(args[backupIdx + 1]) : null;

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
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

type S3Object = { key: string; size: number; lastModified: string };

// -------------------------------------------------------------------
// DB 참조 수집
// -------------------------------------------------------------------

/**
 * 이미지가 "실제로 쓰이고 있는" 위치.
 *
 * images 테이블은 여기 넣지 않는다. images는 업로드 기록을 담는 레지스트리라서
 * 앱 어디에서도 안 쓰는 이미지의 행도 남아 있다. images를 참조로 세면
 * 미사용 객체가 사용 중으로 잘못 분류된다(이것이 기존 1,689/540 집계의 원인이다).
 *
 * 레거시 컬럼은 이미 드롭되었을 수 있으므로, 없으면 "없음"으로 보고만 하고 넘어간다.
 * 이미지 ID를 저장하는 컬럼이 새로 생기면 반드시 여기에 추가해야 한다.
 */
const REFERENCE_SOURCES: { table: string; column: string; kind: "uuid" | "path" | "scan" }[] = [
  { table: "userinfo", column: "image_id", kind: "uuid" },
  { table: "collections", column: "image_id", kind: "uuid" },
  { table: "selection_images", column: "image_id", kind: "uuid" },
  // 아래는 UUID 마이그레이션 이전 레거시 컬럼. 남아 있으면 참조로 취급한다.
  { table: "userinfo", column: "image_file_path", kind: "path" },
  { table: "collections", column: "image_file_path", kind: "path" },
  { table: "selections", column: "image_file_paths", kind: "path" },
  { table: "selections_v2", column: "image_file_paths", kind: "path" },
  // JSON/텍스트 컬럼 안에 이미지 참조가 섞여 들어갔을 가능성까지 훑는다.
  { table: "selections", column: "items", kind: "scan" },
  { table: "collections", column: "tags", kind: "scan" },
  { table: "selections", column: "link", kind: "scan" },
];

type SourceResult = {
  table: string;
  column: string;
  status: "ok" | "missing";
  rows: number;
  hits: number;
};

async function collectReferences(): Promise<{
  uuids: Set<string>;
  rawPaths: Set<string>;
  legacyUuids: Set<string>;
  legacyPaths: Set<string>;
  sources: SourceResult[];
}> {
  const uuids = new Set<string>();
  const rawPaths = new Set<string>();
  const legacyUuids = new Set<string>();
  const legacyPaths = new Set<string>();
  const sources: SourceResult[] = [];

  const LEGACY_TABLES = new Set(["selections_v2"]);
  const LEGACY_COLUMNS = new Set(["image_file_path", "image_file_paths"]);

  for (const src of REFERENCE_SOURCES) {
    const isLegacy = LEGACY_TABLES.has(src.table) || LEGACY_COLUMNS.has(src.column);
    let rows = 0;
    let hits = 0;
    let missing = false;

    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from(src.table)
        .select(src.column)
        .range(from, from + 999);

      if (error) {
        // 42P01: 테이블 없음, 42703: 컬럼 없음 — 이미 드롭된 레거시로 간주한다.
        missing = true;
        break;
      }
      rows += (data ?? []).length;

      for (const row of data ?? []) {
        const value = (row as unknown as Record<string, unknown>)[src.column];
        if (value === null || value === undefined) continue;

        const text = typeof value === "string" ? value : JSON.stringify(value);
        if (text.length === 0) continue;

        const found = text.match(UUID_RE);
        if (found) {
          for (const id of found) {
            hits++;
            (isLegacy ? legacyUuids : uuids).add(id.toLowerCase());
          }
        }
        if (src.kind === "path" || src.kind === "scan") {
          // 경로 형태의 값은 키 그대로도 참조로 본다 (레거시 중첩 경로 대응).
          for (const candidate of extractPathCandidates(value)) {
            hits++;
            (isLegacy ? legacyPaths : rawPaths).add(candidate);
          }
        }
      }

      if ((data ?? []).length < 1000) break;
    }

    sources.push({
      table: src.table,
      column: src.column,
      status: missing ? "missing" : "ok",
      rows,
      hits,
    });
  }

  return { uuids, rawPaths, legacyUuids, legacyPaths, sources };
}

function extractPathCandidates(value: unknown): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v !== "string") return;
    const trimmed = v.trim();
    if (trimmed.length === 0) return;
    if (!/\.(jpg|jpeg|png|webp|heic|heif|gif)$/i.test(trimmed)) return;
    // URL로 저장된 경우 경로 부분만 남긴다.
    const withoutOrigin = trimmed.replace(/^https?:\/\/[^/]+\//i, "");
    out.push(withoutOrigin.replace(/^\/+/, ""));
  };

  if (Array.isArray(value)) value.forEach(push);
  else if (typeof value === "object" && value !== null) {
    for (const v of Object.values(value)) push(v);
  } else push(value);

  return out;
}

// -------------------------------------------------------------------
// S3
// -------------------------------------------------------------------

async function listAllObjects(): Promise<S3Object[]> {
  const objects: S3Object[] = [];
  let token: string | undefined;
  do {
    const res: ListObjectsV2CommandOutput = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: token, MaxKeys: 1000 })
    );
    for (const o of res.Contents ?? []) {
      objects.push({
        key: o.Key!,
        size: o.Size ?? 0,
        lastModified: (o.LastModified ?? new Date(0)).toISOString(),
      });
    }
    token = res.NextContinuationToken;
  } while (token);
  return objects;
}

/** images 레지스트리. 사용 여부와 무관하게 업로드 기록만 담는 테이블이다. */
async function loadImageRegistry(): Promise<{ live: Set<string>; softDeleted: Set<string> }> {
  const live = new Set<string>();
  const softDeleted = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("images")
      .select("image_id, deleted_at")
      .range(from, from + 999);
    if (error) throw new Error(`images 조회 실패: ${error.message}`);
    for (const row of data ?? []) {
      (row.deleted_at ? softDeleted : live).add(row.image_id as string);
    }
    if ((data ?? []).length < 1000) break;
  }
  return { live, softDeleted };
}

async function bucketVersioning(): Promise<string> {
  try {
    const res = await s3.send(new GetBucketVersioningCommand({ Bucket: BUCKET }));
    return res.Status ?? "Disabled (미설정)";
  } catch (err) {
    return `확인 불가 (${(err as Error).name} — IAM에 s3:GetBucketVersioning 권한 필요)`;
  }
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

type BackupEntry = { key: string; size: number; sha256: string; error?: string };

/**
 * 삭제 대상을 로컬에 내려받는다. S3 키 구조를 그대로 재현하므로,
 * 복구가 필요하면 같은 키로 다시 업로드하면 된다.
 * 이미 받아둔 파일 중 크기가 맞는 것은 건너뛰어 재실행이 가능하다.
 */
async function backupObjects(
  keys: string[],
  sizeByKey: Map<string, number>
): Promise<BackupEntry[]> {
  const results: BackupEntry[] = new Array(keys.length);
  let index = 0;
  let done = 0;

  async function worker() {
    while (index < keys.length) {
      const i = index++;
      const key = keys[i];
      const dest = path.join(BACKUP_DIR!, key);
      try {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const expected = sizeByKey.get(key);

        let buf: Buffer;
        if (fs.existsSync(dest) && fs.statSync(dest).size === expected) {
          buf = fs.readFileSync(dest); // 재실행 시 이미 받은 파일 재사용
        } else {
          const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
          buf = Buffer.from(await res.Body!.transformToByteArray());
          fs.writeFileSync(dest, buf);
        }

        results[i] = {
          key,
          size: buf.length,
          sha256: createHash("sha256").update(buf).digest("hex"),
        };
      } catch (err) {
        results[i] = { key, size: -1, sha256: "", error: (err as Error).message };
      }
      if (++done % 50 === 0) console.log(`  ${done}/${keys.length}`);
    }
  }

  await Promise.all(Array.from({ length: 8 }, worker));
  return results;
}

// -------------------------------------------------------------------

async function main() {
  console.log("========================================");
  console.log(EXECUTE && CONFIRMED ? "EXECUTE 모드 (실제 삭제)" : "DRY RUN 모드 (삭제하지 않음)");
  console.log(`Bucket: ${BUCKET} / Region: ${AWS_REGION}`);
  console.log("========================================\n");

  if (EXECUTE && !CONFIRMED) {
    console.error("--execute 만으로는 삭제하지 않는다. --confirm-delete 를 함께 지정할 것.");
    process.exit(1);
  }

  const refs = await collectReferences();

  console.log("--- DB 참조 소스 점검 ---");
  for (const s of refs.sources) {
    const label = `${s.table}.${s.column}`.padEnd(34);
    console.log(
      s.status === "missing"
        ? `  ${label} 없음 (드롭된 레거시로 간주)`
        : `  ${label} 행 ${s.rows} / 참조값 ${s.hits}`
    );
  }

  const objects = await listAllObjects();
  const totalSize = objects.reduce((a, b) => a + b.size, 0);

  // 참조 키 집합: UUID 참조는 {uuid}.jpg 로, 경로 참조는 값 그대로 대조한다.
  const referencedKeys = new Set<string>();
  for (const id of refs.uuids) referencedKeys.add(`${id}.jpg`);
  for (const p of refs.rawPaths) referencedKeys.add(p);

  const legacyReferencedKeys = new Set<string>();
  for (const id of refs.legacyUuids) legacyReferencedKeys.add(`${id}.jpg`);
  for (const p of refs.legacyPaths) legacyReferencedKeys.add(p);

  const referenced = objects.filter((o) => referencedKeys.has(o.key));
  const legacyOnly = objects.filter(
    (o) => !referencedKeys.has(o.key) && legacyReferencedKeys.has(o.key)
  );
  const orphans = objects.filter(
    (o) => !referencedKeys.has(o.key) && !legacyReferencedKeys.has(o.key)
  );

  const refSize = referenced.reduce((a, b) => a + b.size, 0);
  const orphanSize = orphans.reduce((a, b) => a + b.size, 0);

  // 후보를 형태별로 나눈다 (레거시 중첩 경로 vs 평면 UUID 고아).
  const nestedOrphans = orphans.filter((o) => o.key.includes("/"));
  const flatOrphans = orphans.filter((o) => !o.key.includes("/"));

  // 평면 UUID 고아는 images 레지스트리에 행이 남아 있는지까지 구분해서 보고한다.
  const registry = await loadImageRegistry();
  const flatLive = flatOrphans.filter((o) => registry.live.has(o.key.replace(/\.jpg$/i, "")));
  const flatSoftDeleted = flatOrphans.filter((o) =>
    registry.softDeleted.has(o.key.replace(/\.jpg$/i, ""))
  );
  const flatUnknown = flatOrphans.filter(
    (o) =>
      !registry.live.has(o.key.replace(/\.jpg$/i, "")) &&
      !registry.softDeleted.has(o.key.replace(/\.jpg$/i, ""))
  );
  const byPrefix = new Map<string, { count: number; size: number }>();
  for (const o of nestedOrphans) {
    const seg = o.key.split("/");
    const label = seg.length >= 3 ? `{user}/${seg[1]}/` : `${seg.slice(0, -1).join("/")}/`;
    const cur = byPrefix.get(label) ?? { count: 0, size: 0 };
    byPrefix.set(label, { count: cur.count + 1, size: cur.size + o.size });
  }

  console.log("\n--- dry-run 보고 ---");
  console.log(`1. 전체 S3 객체            : ${objects.length}개 / ${mb(totalSize)}`);
  console.log(`2. 앱에서 사용 중인 객체   : ${referenced.length}개 / ${mb(refSize)}`);
  console.log(`3. 고아 후보 객체          : ${orphans.length}개 / ${mb(orphanSize)}`);
  console.log("4. 후보 형태별 내역:");
  for (const [p, v] of [...byPrefix].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`     ${("레거시 " + p).padEnd(30)} ${v.count}개 / ${mb(v.size)}`);
  }
  console.log(`     ${"평면 {uuid} (images 행 살아있음)".padEnd(30)} ${flatLive.length}개 / ${mb(flatLive.reduce((a, b) => a + b.size, 0))}`);
  console.log(`     ${"평면 {uuid} (images 행 삭제표시)".padEnd(30)} ${flatSoftDeleted.length}개 / ${mb(flatSoftDeleted.reduce((a, b) => a + b.size, 0))}`);
  console.log(`     ${"평면 {uuid} (images 행 없음)".padEnd(30)} ${flatUnknown.length}개 / ${mb(flatUnknown.reduce((a, b) => a + b.size, 0))}`);
  console.log(`5. 사용 중이라 제외        : ${referenced.length}개`);
  console.log(`   레거시 컬럼 참조로 제외 : ${legacyOnly.length}개`);
  console.log(`7. 예상 삭제 후 객체 수    : ${objects.length - orphans.length}개`);
  console.log(`8. 예상 삭제 후 총용량     : ${mb(totalSize - orphanSize)}`);
  console.log(`9. 버킷 버전 관리 상태     : ${await bucketVersioning()}`);

  // 참조 객체가 S3에 없는 경우(데이터 정합성 문제)도 함께 보고한다.
  const objectKeys = new Set(objects.map((o) => o.key));
  const missing = [...referencedKeys].filter((k) => !objectKeys.has(k));
  console.log(`   DB 참조인데 S3에 없는 키: ${missing.length}개`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(OUT_DIR, `orphan-candidates-${stamp}.json`);
  const csvPath = path.join(OUT_DIR, `orphan-candidates-${stamp}.csv`);

  const flatLiveKeys = new Set(flatLive.map((o) => o.key));
  const flatSoftKeys = new Set(flatSoftDeleted.map((o) => o.key));
  const candidates = orphans.map((o) => ({
    key: o.key,
    size: o.size,
    lastModified: o.lastModified,
    shape: o.key.includes("/")
      ? "legacy-nested"
      : flatLiveKeys.has(o.key)
        ? "flat-uuid-registry-live"
        : flatSoftKeys.has(o.key)
          ? "flat-uuid-registry-deleted"
          : "flat-uuid-no-registry-row",
  }));

  fs.writeFileSync(jsonPath, JSON.stringify({ bucket: BUCKET, generatedAt: new Date().toISOString(), candidates }, null, 2));
  fs.writeFileSync(
    csvPath,
    ["key,size,lastModified,shape", ...candidates.map((c) => `"${c.key}",${c.size},${c.lastModified},${c.shape}`)].join("\n")
  );
  console.log(`6. 삭제 예정 키 목록       : ${jsonPath}`);
  console.log(`                             ${csvPath}`);

  if (!EXECUTE || !CONFIRMED) {
    console.log("\nDRY RUN 종료. 실제 삭제는 --execute --confirm-delete 필요.");
    return;
  }

  // -----------------------------------------------------------------
  // 실제 삭제
  // -----------------------------------------------------------------
  let targets = candidates.map((c) => c.key);

  if (FROM_FILE) {
    const saved = JSON.parse(fs.readFileSync(path.resolve(FROM_FILE), "utf-8")) as {
      candidates: { key: string }[];
    };
    // 목록 파일을 쓰더라도 삭제 직전에 참조 여부를 다시 확인한다.
    targets = saved.candidates
      .map((c) => c.key)
      .filter((k) => !referencedKeys.has(k) && !legacyReferencedKeys.has(k));
    console.log(`\n목록 파일 사용: ${FROM_FILE} (재검증 후 ${targets.length}개)`);
  }

  // 재실행 대비: 이미 사라진 키는 제외한다.
  targets = targets.filter((k) => objectKeys.has(k));

  // 버저닝이 꺼진 버킷에서는 삭제가 되돌릴 수 없다.
  // 백업 경로가 주어지면 전량을 먼저 내려받고, 완전히 검증되기 전에는 삭제하지 않는다.
  if (BACKUP_DIR) {
    const sizeByKey = new Map(objects.map((o) => [o.key, o.size]));
    console.log(`\n백업 시작: ${targets.length}개 -> ${BACKUP_DIR}`);
    const manifest = await backupObjects(targets, sizeByKey);

    const bad = manifest.filter((m) => m.error || m.size !== sizeByKey.get(m.key));
    if (bad.length > 0) {
      console.error(`백업 실패 ${bad.length}건 — 삭제를 중단한다.`);
      for (const b of bad.slice(0, 20)) console.error(`  ${b.key} ${b.error ?? "크기 불일치"}`);
      process.exit(1);
    }

    const manifestPath = path.join(BACKUP_DIR, "manifest.json");
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({ bucket: BUCKET, backedUpAt: new Date().toISOString(), objects: manifest }, null, 2)
    );
    const totalBackedUp = manifest.reduce((a, b) => a + b.size, 0);
    console.log(`백업 완료: ${manifest.length}개 / ${mb(totalBackedUp)} (전량 크기 일치)`);
    console.log(`매니페스트: ${manifestPath}`);
  } else {
    console.log("\n경고: --backup-dir 미지정. 버저닝이 꺼져 있으면 삭제를 되돌릴 수 없다.");
  }

  console.log(`\n삭제 시작: ${targets.length}개`);
  const deleted: string[] = [];
  const failed: { key: string; reason: string }[] = [];

  for (let i = 0; i < targets.length; i += 1000) {
    const batch = targets.slice(i, i + 1000);
    const res = await s3.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: false },
      })
    );
    for (const d of res.Deleted ?? []) deleted.push(d.Key!);
    for (const e of res.Errors ?? []) failed.push({ key: e.Key!, reason: `${e.Code}: ${e.Message}` });
    console.log(`  배치 ${i / 1000 + 1}: 성공 ${res.Deleted?.length ?? 0} / 실패 ${res.Errors?.length ?? 0}`);
  }

  // 평면 {uuid}.jpg 고아는 images 행이 살아있을 수 있으므로 soft delete 처리한다.
  if (MARK_DB_DELETED) {
    const ids = deleted
      .filter((k) => !k.includes("/"))
      .map((k) => k.replace(/\.jpg$/i, ""))
      .filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { error } = await supabase
        .from("images")
        .update({ deleted_at: new Date().toISOString() })
        .in("image_id", chunk)
        .is("deleted_at", null);
      if (error) console.error(`  images soft delete 실패: ${error.message}`);
    }
    console.log(`  images.deleted_at 표시: ${ids.length}건 대상`);
  }

  const resultPath = path.join(OUT_DIR, `orphan-delete-result-${stamp}.json`);
  fs.writeFileSync(resultPath, JSON.stringify({ deleted, failed }, null, 2));
  console.log(`\n삭제 결과: 성공 ${deleted.length} / 실패 ${failed.length}`);
  console.log(`결과 파일: ${resultPath}`);
  if (failed.length > 0) {
    console.log("실패 객체는 위 파일에 기록됨. 동일 명령으로 재실행하면 재시도된다.");
  }

  // 사후 검증: 참조 객체가 지워지지 않았는지, 객체 수/용량이 예상과 맞는지 확인한다.
  const after = await listAllObjects();
  const afterKeys = new Set(after.map((o) => o.key));
  const brokenRefs = [...referencedKeys].filter((k) => objectKeys.has(k) && !afterKeys.has(k));
  console.log("\n--- 사후 검증 ---");
  console.log(`  삭제 후 객체 수 : ${after.length}개 (예상 ${objects.length - deleted.length})`);
  console.log(`  삭제 후 총용량  : ${mb(after.reduce((a, b) => a + b.size, 0))}`);
  console.log(`  참조 객체 유실  : ${brokenRefs.length}개 ${brokenRefs.length === 0 ? "(정상)" : "*** 즉시 확인 필요 ***"}`);
  for (const k of brokenRefs.slice(0, 20)) console.log(`    - ${k}`);
}

main().catch((e) => {
  console.error("실패:", e);
  process.exit(1);
});
