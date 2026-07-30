# 이미지 파이프라인 (업로드 · 동적 리사이즈 · 운영)

이미지 URL은 **서버가 만들지 않는다.** API는 지금까지처럼 `image_id`만 반환하고,
클라이언트가 화면 폭에 맞춰 URL을 조립한다.

```
https://image.collecter.kr/t/{imageId}.jpg?w={128|320|640|1280}
```

- S3에는 이미지 1장당 **기준 이미지 한 개**만 저장한다. (`{imageId}.jpg`, 평면 구조)
- 화면별 크기는 저장하지 않고 요청 시 변환하며, 결과는 **CloudFront 캐시에만** 남는다.
- 기존 이미지와 신규 이미지를 구분하는 분기는 코드 어디에도 없다.

```
앱 ──(image_id)── API 응답
 │
 └─ https://image.collecter.kr/t/{id}.jpg?w=320
        │
        ├─ CloudFront  /t/*  → API 컨테이너(Railway)  → S3 GetObject → sharp → JPEG
        └─ CloudFront  기본  → S3 오리진 (share.collecter.kr 웹 OG 이미지용 원본 경로)
```

---

## 1. 저장 규격

| 대상 | 최대 변 | JPEG 품질 |
|---|---|---|
| 프로필 (`PATCH /users/me`) | 800px | 80 |
| 셀렉션 (`POST /collections/{id}/selections`, `PATCH /selections/{id}`) | 1600px | 82 |

컬렉션 커버는 **별도 업로드 경로가 없다.** 첫 셀렉션 이미지의 `image_id`를 재사용하므로
셀렉션 규격을 그대로 따른다.

공통 처리 ([src/lib/image.ts](../src/lib/image.ts)):

- 원본 비율 유지, `withoutEnlargement: true` (작은 이미지는 확대하지 않음)
- `.rotate()`로 EXIF 방향 보정 후, 출력에 메타데이터를 복사하지 않아 GPS 등 EXIF 제거
- **투명 영역 배경은 흰색(`#ffffff`)** — `JPEG_FLATTEN_BACKGROUND`.
  지정하지 않으면 sharp가 검은색으로 채운다. 업로드와 동적 리사이즈가 같은 상수를 쓴다.
- 항상 JPEG로 재인코딩 → 키는 `.jpg`, `Content-Type: image/jpeg`
- `Cache-Control: public, max-age=31536000, immutable`
- 클라이언트가 보낸 MIME/확장자는 신뢰하지 않고 실제 바이트를 디코딩해 판정

### 입력 제한 (초과 시 400)

| 항목 | 값 | 근거 |
|---|---|---|
| 최대 파일 크기 | 15MB | 현재 저장된 객체 최대치가 10.08MB (p99 5.9MB) |
| 최대 픽셀 수 | 60MP | iPhone 48MP 촬영본(8064×6048 = 48.8MP)을 통과시켜야 함 |

400으로 거부: 이미지가 아닌 파일 / 손상된 이미지 / 미지원 포맷 / 크기 초과 / 픽셀 수 초과.
S3·DB 실패는 500이며, **S3 업로드 후 DB 저장에 실패하면 방금 올린 객체를 삭제**한다.

### 교체 순서

1. 신규 이미지 검증·최적화 → 2. 새 UUID로 S3 업로드 → 3. DB를 새 `image_id`로 변경
→ 4. 변경 성공 확인 → 5. 기존 S3 객체 삭제

실패하면 기존 이미지가 그대로 남는다. 기존 UUID를 덮어쓰지 않으므로 CloudFront 무효화는 필요 없다.

---

## 2. 동적 이미지 라우트

[src/app/t/[imageFile]/route.ts](../src/app/t/[imageFile]/route.ts)

| 검증 | 규칙 |
|---|---|
| 파일명 | `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$` (소문자 UUID만) |
| `w` | `128` `320` `640` `1280` 문자열 완전 일치. 없으면 400, 임의 값 보정 없음, 원본 폴백 없음 |
| 쿼리스트링 | `w` 외 키가 있으면 400, `w` 중복도 400 |

파일명 정규식 하나로 `/`, `\`, `..`, `%2F`, null byte, 다른 확장자, 내부 S3 경로가 모두 걸러진다.

| 너비 | 출력 품질 |
|---|---|
| 128 | 75 |
| 320 | 78 |
| 640 | 80 |
| 1280 | 82 |

응답:

```http
200  Content-Type: image/jpeg
     Content-Length: <정확한 길이>
     Cache-Control: public, max-age=31536000, immutable

400/403/404/413/500/503
     Cache-Control: no-store
     {"error":"invalid_width"}      ← 내부 키·버킷·AWS 원문·경로·스택 미노출
```

### 동시성 제한

[src/lib/imageQueue.ts](../src/lib/imageQueue.ts). **프로세스(컨테이너 인스턴스) 단위**이므로
인스턴스를 N개 띄우면 전체 동시 처리량도 N배가 된다.

| 환경변수 | 기본값 | 의미 |
|---|---|---|
| `IMAGE_RESIZE_CONCURRENCY` | 2 | 동시 sharp 작업 수 |
| `IMAGE_RESIZE_QUEUE_LIMIT` | 20 | 대기열 최대 길이 (초과 시 503) |
| `IMAGE_RESIZE_QUEUE_TIMEOUT_MS` | 5000 | 대기 타임아웃 (초과 시 503) |
| `IMAGE_RESIZE_JOB_TIMEOUT_MS` | 10000 | 처리 타임아웃 (초과 시 503) |
| `IMAGE_SHARP_CONCURRENCY` | 1 | libvips 스레드 수. 기본값(코어 수)을 두면 위 동시성과 곱해져 스레드가 폭증한다 |

기본값 근거: 60MP 디코딩 시 RGB 원본만 약 180MB. 동시 2건이면 순간 피크가 약 400MB로
512MB~1GB 컨테이너에서도 버틴다. Railway 인스턴스 메모리를 올렸다면 함께 올린다.

S3 원본은 `MAX_SOURCE_BYTES`(20MB)를 넘으면 본문을 읽지 않고 413으로 거부한다.

---

## 3. 환경변수

```bash
# 동적 이미지 라우트 보호 (CloudFront Origin Custom Header와 같은 값)
IMAGE_ORIGIN_VERIFY_SECRET=<랜덤 32바이트 이상>

# 선택 — 미설정 시 위 표의 기본값 사용
IMAGE_RESIZE_CONCURRENCY=2
IMAGE_RESIZE_QUEUE_LIMIT=20
IMAGE_RESIZE_QUEUE_TIMEOUT_MS=5000
IMAGE_RESIZE_JOB_TIMEOUT_MS=10000
IMAGE_SHARP_CONCURRENCY=1
```

`IMAGE_ORIGIN_VERIFY_SECRET`이 **비어 있으면 검사를 건너뛴다**(로컬 개발용).
운영 환경에는 반드시 설정한다.

---

## 4. AWS 콘솔 설정

> 코드 배포만으로는 동작하지 않는다. 아래는 전부 콘솔에서 직접 해야 하는 작업이다.

### 4-1. 비밀 값 만들기

로컬 터미널에서:

```bash
openssl rand -hex 32
```

출력값을 (A)라 하자. Railway 환경변수 `IMAGE_ORIGIN_VERIFY_SECRET`에 넣고,
아래 CloudFront Origin Custom Header에도 같은 값을 넣는다. 코드에 넣지 않는다.

### 4-2. CloudFront 오리진 추가

CloudFront → 해당 배포(`image.collecter.kr`) → **Origins** → Create origin

| 항목 | 값 |
|---|---|
| Origin domain | **`api.collecter.kr`** (Railway 공개 도메인, 포트 8080으로 매핑됨) — **`image.collecter.kr`을 넣지 말 것** (자기 자신 호출 = 무한 루프) |
| Protocol | HTTPS only |
| HTTPS port | 443 |
| Minimum origin SSL protocol | TLSv1.2 |
| Add custom header | Name `X-Image-Origin-Verify` / Value (A) |
| Origin Shield | 선택 사항. 켠다면 **아시아 태평양(싱가포르)** — Shield는 오리진에 가까운 리전에 둬야 효과가 있다(오리진이 Railway 싱가포르). 켜면 여러 엣지의 콜드 미스가 한 번으로 합쳐져 컨테이너 부하가 준다 |

**Host 헤더를 전달하지 않는다.** Railway는 Host로 서비스를 라우팅하므로,
뷰어의 `Host: image.collecter.kr`을 그대로 넘기면 오리진이 404를 낸다.
아래 캐시 정책에 헤더를 넣지 않으면 CloudFront가 알아서 `api.collecter.kr`을 Host로 보낸다.

`api.collecter.kr`과 `image.collecter.kr`은 서로 다른 도메인이므로 순환 호출은 발생하지 않는다.
포트는 Railway가 8080으로 매핑하므로 CloudFront에서는 443만 지정하면 된다.

### 4-3. 캐시 정책 만들기

CloudFront → **Policies** → Cache → Create cache policy

| 항목 | 값 |
|---|---|
| Name | `collecter-image-width` |
| Minimum TTL | 0 |
| Default TTL | 86400 |
| Maximum TTL | 31536000 |
| Headers | None |
| Query strings | **Include specified query strings** → `w` |
| Cookies | None |
| Compression Gzip / Brotli | 끔 (JPEG는 이미 압축되어 있고, 켜면 캐시 키만 늘어난다) |

Maximum TTL 31536000이라 오리진의 `max-age=31536000`이 그대로 존중되고,
Minimum TTL 0이라 오류 응답의 `no-store`도 존중된다.
`w`가 캐시 키에 포함되므로 `w=320`과 `w=640`은 서로 다른 캐시 객체가 된다.

관리형 `CachingOptimized`는 쓰지 않는다 — 쿼리스트링을 캐시 키에서 빼기 때문에
모든 `w` 요청이 한 캐시 객체를 공유해 잘못된 크기가 반환된다.

### 4-4. 비헤이비어 추가

CloudFront → **Behaviors** → Create behavior

| 항목 | 값 |
|---|---|
| Path pattern | `/t/*` |
| Origin | 4-2에서 만든 Railway 오리진 |
| Viewer protocol policy | Redirect HTTP to HTTPS |
| Allowed HTTP methods | GET, HEAD |
| Cache policy | `collecter-image-width` |
| Origin request policy | **없음(None)** — 캐시 키에 있는 `w`만 오리진에 전달된다 |
| Response headers policy | 없음 |
| Precedence | 기본 비헤이비어보다 **위**에 오도록 배치 |

기본 비헤이비어(→ S3 오리진)는 그대로 둔다. `share.collecter.kr` 웹이 쓰는
`https://image.collecter.kr/{id}.jpg` 루트 경로가 여기로 계속 흘러야 한다.

### 4-5. 오류 응답 캐시 끄기

CloudFront → **Error pages** → Create custom error response.
`400`, `403`, `404`, `500`, `502`, `503`, `504` 각각에 대해:

| 항목 | 값 |
|---|---|
| Minimum TTL | 0 |
| Customize error response | No |

CloudFront 기본값은 오류를 10초간 캐시한다. 0으로 낮춰야 일시적 503이 굳지 않는다.

### 4-6. IAM 권한 추가

현재 IAM 유저 `collecter-backend-server`는 오브젝트 권한만 있어
`s3:GetBucketVersioning`이 거부된다(버저닝 상태 확인 불가). 운영 스크립트에는 아래가 필요하다.

IAM → Users → `collecter-backend-server` → Add permissions → Create inline policy → JSON:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BucketLevel",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketVersioning"
      ],
      "Resource": "arn:aws:s3:::collecter-image"
    },
    {
      "Sid": "ObjectLevel",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectAttributes",
        "s3:GetObjectTagging",
        "s3:PutObject",
        "s3:PutObjectTagging",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::collecter-image/*"
    }
  ]
}
```

`s3:PutObject`는 메타데이터 정규화의 `CopyObject`(같은 키 덮어쓰기)에 필요하다.
버저닝이 켜져 있다면 이전 버전 정리를 위해 `s3:DeleteObjectVersion`,
`s3:ListBucketVersions`도 추가해야 한다 — 정리 여부는 승인 후 결정한다.

### 4-7. 비밀 값 회전 절차

1. 새 값 (B) 생성: `openssl rand -hex 32`
2. Railway 환경변수를 `IMAGE_ORIGIN_VERIFY_SECRET=(A),(B)` 로 바꾸고 재배포
   (콤마로 두 값을 나열하면 둘 다 통과한다)
3. CloudFront Origin Custom Header 값을 (B)로 변경 → 배포 완료 대기
4. Railway 환경변수를 `IMAGE_ORIGIN_VERIFY_SECRET=(B)` 로 정리하고 재배포

이 순서를 지키면 회전 중 503/403이 발생하지 않는다.

---

## 5. 캐시 검증

```bash
URL="https://image.collecter.kr/t/<실제-이미지-id>.jpg?w=320"

curl -sI "$URL" | grep -iE 'x-cache|age|content-type|content-length|cache-control'
# 1회차: X-Cache: Miss from cloudfront

curl -sI "$URL" | grep -iE 'x-cache|age'
# 2회차: X-Cache: Hit from cloudfront / Age: 1 이상

# w별 캐시 분리 (Content-Length가 서로 달라야 한다)
curl -sI "https://image.collecter.kr/t/<id>.jpg?w=320" | grep -i content-length
curl -sI "https://image.collecter.kr/t/<id>.jpg?w=640" | grep -i content-length

# 실제 픽셀 폭 확인
curl -s "https://image.collecter.kr/t/<id>.jpg?w=320" -o /tmp/a.jpg && \
  node -e "require('sharp')('/tmp/a.jpg').metadata().then(m=>console.log(m.width))"

# 오리진 직접 호출이 막히는지 (403이어야 정상)
curl -s -o /dev/null -w '%{http_code}\n' "https://<railway-domain>/t/<id>.jpg?w=320"
```

CloudFront 캐시는 이미지·폭 조합당 전 세계에서 딱 한 번만 변환된다는 뜻이 **아니다.**
다른 엣지 로케이션의 첫 요청, 캐시 만료·축출, 무효화, 배포 변경 시 다시 변환된다.

---

## 6. 운영 스크립트

둘 다 **기본이 dry-run**이고, 확인 플래그를 함께 주지 않으면 아무것도 바꾸지 않는다.
결과 파일은 `scripts/out/`에 쌓이며 재실행해도 안전하다.

### 고아 이미지

```bash
tsx scripts/audit-orphan-images.ts                                  # dry-run
tsx scripts/audit-orphan-images.ts --execute --confirm-delete --backup-dir ~/orphan-backup
tsx scripts/audit-orphan-images.ts --execute --confirm-delete --backup-dir ~/orphan-backup \
  --from-file scripts/out/orphan-candidates-<시각>.json
```

**버킷 버저닝이 꺼져 있어 삭제는 되돌릴 수 없다.** `--backup-dir`를 주면 삭제 전에
전량을 로컬로 내려받고, 개수·크기가 하나라도 어긋나면 삭제하지 않고 중단한다.
백업 디렉터리는 S3 키 구조를 그대로 재현하며 `manifest.json`에 SHA-256이 기록된다.

복구가 필요하면 같은 키로 다시 올린다:

```bash
aws s3 cp ~/orphan-backup/ s3://collecter-image/ --recursive --exclude manifest.json
```

- 삭제 판단은 **경로 모양이 아니라 DB 참조 유무**로만 한다.
- `images` 테이블은 참조로 세지 않는다. 업로드 기록용 레지스트리라서
  아무 데서도 안 쓰는 이미지의 행도 남아 있다(이 오해가 기존 1,689/540 집계의 원인이었다).
  실제 사용처는 `userinfo.image_id`, `collections.image_id`, `selection_images.image_id` 세 곳이다.
- 레거시 컬럼(`image_file_path(s)`)이 살아 있으면 참조로 인정하고, 없으면 없다고 보고한다.
- `selections.items` 등 JSON·텍스트 컬럼 안의 이미지 참조도 훑는다.
- 삭제 후 평면 UUID 고아는 `images.deleted_at`을 표시한다(행 자체는 보존, `--no-mark-db-deleted`로 끌 수 있음).
- 삭제 뒤 객체 수·용량을 다시 세고, 사용 중 객체가 지워지지 않았는지 재검증한다.

### 기존 이미지 메타데이터 정규화

```bash
tsx scripts/normalize-image-metadata.ts                                   # dry-run
tsx scripts/normalize-image-metadata.ts --execute --confirm-metadata      # 실제 적용
tsx scripts/normalize-image-metadata.ts --execute --confirm-metadata --verify-sample 20
```

- 대상은 **사용 중인 객체만**. 고아 후보는 건드리지 않는다.
- 확장자와 기존 `Content-Type`을 믿지 않고, S3 Range GET으로 앞 32바이트만 읽어
  파일 시그니처로 실제 포맷을 판정한다. 판정 불가 객체는 변경하지 않고 목록으로 보고한다.
- 같은 버킷·같은 키에 `CopyObject(MetadataDirective=REPLACE)`만 수행한다.
  **본문을 다시 올리지 않고 sharp도 쓰지 않으므로 이미지 바이트와 해상도가 변하지 않는다.**
- Storage Class·암호화(KMS 포함)·사용자 정의 Metadata를 원래 값으로 다시 지정하고,
  태그는 `TaggingDirective` 기본값 `COPY`로 보존한다. ACL은 지정하지 않는다.
- 적용 후 Content-Length·ETag·Content-Type·Cache-Control·Storage Class·암호화·Metadata를
  `HeadObject`로 재확인하고, 샘플 객체는 전체 바이트 SHA-256과 이미지 해상도까지 비교한다.
- 이미 정상인 객체는 건너뛰므로 실패분만 재실행하면 된다.

---

## 7. 배포 순서

1. 서버 코드 배포 (업로드 최적화 + `/t/` 라우트) — 이 시점엔 CloudFront가 아직 `/t/*`를 모른다
2. Railway에 `IMAGE_ORIGIN_VERIFY_SECRET` 설정 후 재배포
3. CloudFront 오리진 · 캐시 정책 · `/t/*` 비헤이비어 · 오류 캐시 TTL 설정 (4-2 ~ 4-5)
4. 기존 이미지 / 신규 이미지 각각 `/t/` URL 확인, Miss → Hit 확인 (5장)
5. 클라이언트 팀에 "동적 URL 사용 가능" 전달 → 앱 배포는 별도 진행
6. 메타데이터 dry-run 결과 보고 → 승인 후 적용
7. 고아 dry-run 결과 보고 → 승인 후 삭제

**동적 라우트와 CloudFront 설정이 끝나기 전에는 클라이언트가 새 URL을 쓰면 안 된다.**

## 8. 롤백

| 문제 | 조치 |
|---|---|
| 동적 리사이즈가 오동작 | CloudFront에서 `/t/*` 비헤이비어를 **비활성화 또는 삭제**. 즉시 반영되고 기존 루트 경로(S3 직접 서빙)는 영향 없음 |
| 서버 코드 문제 | Railway에서 이전 배포로 롤백 |
| 업로드 최적화 문제 | 같은 방법으로 롤백. 이미 저장된 이미지는 그대로 유효 |
| 부하 문제 | `IMAGE_RESIZE_CONCURRENCY`를 낮추거나 `/t/*` 비헤이비어 비활성화 |

- 기존 S3 객체는 어떤 단계에서도 삭제하지 않으므로 원본 데이터는 항상 남는다.
- 클라이언트가 이미 새 URL을 쓰고 있다면, `/t/*`를 내리기 전에 반드시 클라이언트 팀에 알린다.
- **메타데이터 정규화 롤백**: 이미지 바이트를 바꾸지 않으므로 이미지 자체는 되돌릴 필요가 없다.
  버저닝이 켜져 있으면 이전 버전으로 복원할 수 있고, 꺼져 있으면 이전 `Content-Type`으로
  되돌리려면 스크립트를 반대로 한 번 더 돌려야 한다(원래 값은 `scripts/out/metadata-plan-*.json`에 기록됨).
- **고아 삭제 롤백**: 버저닝이 꺼져 있어(2026-07-30 확인) S3 자체로는 복구할 수 없다.
  `--backup-dir` 백업본을 다시 업로드하는 것이 유일한 복구 수단이다.

## 10. 실행 이력

| 날짜 | 작업 | 결과 |
|---|---|---|
| 2026-07-30 | 메타데이터 정규화 | 1,580개 CopyObject 성공 / 실패 0. Content-Length·ETag·해상도·SHA-256 전부 동일 확인 |
| 2026-07-30 | 고아 이미지 삭제 | 649개(766.6MB) 백업 후 삭제, 실패 0. 삭제 후 1,580개 / 1,978.5MB, 사용 중 객체 유실 0 |

백업: `~/collecter-orphan-backup-20260730/` (649개 / 768MB, SHA-256 전량 대조 완료).
문제가 없다고 확신할 때까지 지우지 말 것.

## 9. 비용

| 항목 | 영향 |
|---|---|
| S3 → API 컨테이너 전송 | API는 싱가포르(Railway), S3는 서울(ap-northeast-2)이라 캐시 미스마다 리전 간 인터넷 전송이 발생한다. 객체 평균 1.25MB 기준 S3 아웃바운드 약 $0.126/GB |
| CloudFront 전송 | 기존과 동일하지만, 리사이즈 덕에 실제 전송량은 크게 줄어든다(1280px 기준 원본 대비 1/5~1/10) |
| CloudFront 요청 수 | `w` 4종으로 캐시 객체가 최대 4배 늘지만 요청 단가는 미미 |
| Railway CPU | 콜드 미스에만 소비. Origin Shield(싱가포르)를 켜면 오리진 도달 요청이 줄어든다 |

## 11. 문제 해결

| 증상 | 원인 | 조치 |
|---|---|---|
| `/t/` 요청이 **404** | 서버 코드가 아직 배포 안 됨 | Railway 배포 확인. `curl -I https://api.collecter.kr/t/<id>.jpg?w=320` 로 오리진 직접 확인 |
| `{"error":"forbidden"}` **403** | CloudFront 커스텀 헤더 값과 `IMAGE_ORIGIN_VERIFY_SECRET` 불일치 | 양쪽 값을 다시 맞춘다. 회전 중이면 콤마로 두 값 나열 |
| **502 / 503** (CloudFront가 생성) | 오리진 프로토콜이 HTTP거나, 캐시 정책에 Host 헤더를 넣어 Railway가 라우팅 실패 | 오리진 프로토콜 HTTPS only, 캐시 정책 헤더 None 확인 |
| `w`를 바꿔도 **같은 크기**가 옴 | 캐시 정책이 쿼리스트링을 캐시 키에 안 넣음(관리형 `CachingOptimized` 등) | `collecter-image-width` 정책이 적용됐는지, 쿼리스트링 allowlist에 `w`가 있는지 확인 |
| 항상 `X-Cache: Miss` | 캐시 정책 TTL이 0이거나 오리진이 `no-store`를 보냄 | 200 응답의 `Cache-Control`이 `max-age=31536000`인지, 정책 최대 TTL이 31536000인지 확인 |
| 루트 경로 이미지가 깨짐 | `/t/*` 동작이 기본 동작보다 아래에 있거나 패턴이 `*` 로 잘못됨 | 동작 목록에서 `/t/*` 가 `Default (*)` 위에 있는지 확인 |
| 고아 540~649개 삭제 | 약 636~767MB 감소 (S3 스토리지 월 $0.025/GB 기준 미미) |
