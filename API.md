# Collecter API

Next.js App Router 기반 API 문서입니다. (경로: `src/app/api/**/route.ts`)

## 인증 (Token)

- **헤더**: `Authorization: Bearer <access_token>`
- **토큰 발급**
  - `POST /api/auth/otp/verify` → `verified_token` 발급 (단기)
  - `POST /api/auth/login` 또는 `POST /api/signup` → `access_token` + `refresh_token` 발급
- **토큰 필요 여부 표기**
  - **필수**: 토큰 없으면 `401 { "errorCode": "SU000", "msg": "Unauthorized", "data": {} }`
  - **선택**: 토큰이 있으면 개인화(예: 차단 유저 제외, 좋아요 여부 계산) 반영
  - **불필요**: 인증 없이 호출 가능

## 공통 응답 형식

모든 API 응답은 아래 형식을 따릅니다:

```json
{
  "errorCode": "SU000",
  "msg": "ok",
  "data": {}
}
```

- `errorCode`: 현재 모두 `"SU000"` 으로 통일
- `msg`: 성공 시 `"ok"`, 에러 시 에러 메시지
- `data`: 성공 시 응답 데이터, 에러 시 `{}`

## 이미지 업로드 공통 사항

- 이미지가 있는 모든 쓰기 API는 `multipart/form-data` 형식으로 요청합니다.
- 이미지 필드명: 단일 이미지 → `image`, 다중 이미지 → `images` (같은 키 반복)
- 이미지는 서버에서 S3에 업로드 후 `images` 테이블에 기록되며, 각 리소스는 `image_id` (UUID FK)로 참조합니다.
- 조회 응답에는 `image_id`와 함께 `images: { file_path }` 형태로 실제 경로가 포함됩니다.
- S3 업로드를 위해 서버 환경변수에 버킷/리전 정보가 필요합니다.
  - `AWS_REGION` (optional, default `ap-northeast-2`)
  - 버킷명 (required): `AWS_BUCKET_NAME` (권장) 또는 `AWS_BUCKET` / `S3_BUCKET_NAME` / `S3_BUCKET`
  - 로컬에서 static key를 쓰는 경우: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
  - 배포 환경에서는 가능하면 IAM Role 등 managed credential을 사용하고, 위 key/secret은 생략합니다.

---

## Auth

### GET `/api/auth/check-email`

- **토큰**: 불필요
- **Query**
  - `email` (string, required)
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { "success": boolean } }` (`true`면 사용 가능, `false`면 이미 사용 중)
- **에러**
  - 400 `{ "errorCode": "SU000", "msg": "email parameter is required", "data": {} }`

### GET `/api/auth/check-username`

- **토큰**: 불필요
- **Query**
  - `username` (string, required)
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { "success": boolean } }` (`true`면 사용 가능, `false`면 이미 사용 중)
- **에러**
  - 400 `{ "errorCode": "SU000", "msg": "username parameter is required", "data": {} }`

### POST `/api/auth/otp/send`

- **토큰**: 불필요
- **Body**
  - `email` (string, required)
  - `shouldCreateUser` (boolean, optional, default `false`) — `true`면 해당 이메일 유저가 없을 때 생성
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { "success": true } }`
- **에러**
  - 400 `{ "errorCode": "SU000", "msg": "email is required", "data": {} }`
  - 500 `{ "errorCode": "SU000", "msg": "Failed to send OTP", "data": {} }`

### POST `/api/auth/otp/verify`

- **토큰**: 불필요
- **Body**
  - `email` (string, required)
  - `token` (string, required) — 이메일 OTP 코드
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { "verified_token": string, "is_new_user": boolean } }`
- **에러**
  - 400 `{ "errorCode": "SU000", "msg": "email and token are required", "data": {} }`
  - 400 `{ "errorCode": "SU000", "msg": "Invalid OTP", "data": {} }`
  - 404 `{ "errorCode": "SU000", "msg": "User info not found", "data": {} }`
  - 500 `{ "errorCode": "SU000", "msg": "Server error", "data": {} }`

### POST `/api/auth/login`

- **토큰**: 불필요
- **Body**
  - `verified_token` (string, required) — `POST /api/auth/otp/verify` 결과
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { "access_token": string, "refresh_token": string } }`
- **에러**
  - 400 `{ "errorCode": "SU000", "msg": "verified_token is required", "data": {} }`
  - 400 `{ "errorCode": "SU000", "msg": "Invalid or expired verified_token", "data": {} }` 또는 `{ "errorCode": "SU000", "msg": "Invalid verified_token", "data": {} }`

### POST `/api/auth/logout`

- **토큰**: 필수
- **Body**
  - `refresh_token` (string, required)
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { "success": true } }`
- **에러**
  - 400 `{ "errorCode": "SU000", "msg": "refresh_token is required", "data": {} }`
  - 400 `{ "errorCode": "SU000", "msg": "Invalid refresh token", "data": {} }`
  - 500 `{ "errorCode": "SU000", "msg": "Failed to logout", "data": {} }`

### POST `/api/auth/refresh`

- **토큰**: 불필요
- **Body**
  - `refresh_token` (string, required)
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { "access_token": string, "refresh_token": string } }` (refresh 토큰은 회전되어 새로 발급됩니다)
- **에러**
  - 400 `{ "errorCode": "SU000", "msg": "refresh_token is required", "data": {} }` 또는 `{ "errorCode": "SU000", "msg": "Invalid refresh token", "data": {} }`
  - 401 `{ "errorCode": "SU000", "msg": "Unauthorized", "data": {} }` (세션 만료/폐기 등)

### DELETE `/api/auth/delete`

- **토큰**: 필수
- **Body**: 없음
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { "success": true } }`
- **에러**
  - 500 `{ "errorCode": "SU000", "msg": "Failed to delete user", "data": {} }`

---

## Users

### GET `/api/users/me`

- **토큰**: 필수
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { user: { user_id, name, email, description, image_id } } }`

### PATCH `/api/users/me` (프로필 수정)

- **토큰**: 필수
- **Content-Type**: `multipart/form-data`
- **Body**
  - `name` (string, required)
  - `description` (string, optional)
  - `image` (File, optional) — 새 프로필 이미지. 기존 이미지는 자동 삭제됩니다.
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { "success": true } }`
- **에러**
  - 400 `{ "errorCode": "SU000", "msg": "name is required", "data": {} }`
  - 500 `{ "errorCode": "SU000", "msg": "Failed to upload image", "data": {} }`

### GET `/api/users/me/likes`

- **토큰**: 필수
- **동작**
  - 차단한 유저의 컬렉션 제외
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { collections: any[] } }`

### GET `/api/users/me/blocks`

- **토큰**: 필수
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { blocked_user_ids: number[] } }`

### POST `/api/users/me/blocks`

- **토큰**: 필수
- **Body**
  - `blocked_user_id` (number, required)
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { "success": true } }`
- **에러**
  - 400 `{ "errorCode": "SU000", "msg": "blocked_user_id is required", "data": {} }`

### GET `/api/users/me/collections`

- **토큰**: 필수
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { collections: any[] } }`

---

## Signup

### POST `/api/signup`

- **토큰**: 불필요
- **Content-Type**: `multipart/form-data`
- **Body**
  - `verified_token` (string, required) — `POST /api/auth/otp/verify` 결과
  - `email` (string, required)
  - `name` (string, required)
  - `description` (string, optional)
  - `image` (File, optional) — 프로필 이미지
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { "access_token": string, "refresh_token": string } }`
- **에러**
  - 400 `{ "errorCode": "SU000", "msg": "verified_token is required", "data": {} }`
  - 400 `{ "errorCode": "SU000", "msg": "email and name are required", "data": {} }`
  - 400 `{ "errorCode": "SU000", "msg": "Invalid or expired verified_token", "data": {} }` 또는 `{ "errorCode": "SU000", "msg": "Invalid verified_token", "data": {} }`
  - 500 `{ "errorCode": "SU000", "msg": "Failed to upload image", "data": {} }`
  - 500 `{ "errorCode": "SU000", "msg": "Failed to signup", "data": {} }`

### GET `/api/users/search`

- **토큰**: 선택
- **Query**
  - `q` (string, required)
- **동작**
  - `userinfo.name` textSearch (`simple` config, plain query)
  - 로그인 시: 본인 제외, 차단한 유저 제외
  - **소프트 삭제된 유저 제외**
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { users: UserInfo[] } }`
- **에러**
  - 400 `{ "errorCode": "SU000", "msg": "Query parameter 'q' is required", "data": {} }`

### GET `/api/users/ranking`

- **토큰**: 선택
- **Query**: 없음
- **동작**
  - 최근 가입순 최대 10명
  - 로그인 시: 차단한 유저 제외
  - **소프트 삭제된 유저 제외**
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { "users": any[] } }`

### GET `/api/user/detail`

- **토큰**: 선택
- **Query**
  - `user_id` (number, required)
- **동작**
  - Authorization이 있고 본인(`auth.userId === user_id`)이면 **공개/비공개 컬렉션 모두 반환**
  - 그 외에는 **공개 컬렉션만 반환**
- **요청 예시**

```bash
curl -X GET "https://<host>/api/user/detail?user_id=45"
```

- **응답 200 예시**

```json
{
  "errorCode": "SU000",
  "msg": "ok",
  "data": {
    "user_id": 45,
    "user_name": "gimgahui",
    "image_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "description": "안녕하세요",
    "collections": [
      {
        "collection_id": 123,
        "collection_title": "내 컬렉션",
        "image_id": "b7c6f3b0-6a0f-4b4a-9a90-2c02e4a2b9a1"
      },
      {
        "collection_id": 124,
        "collection_title": "커버 없는 컬렉션",
        "image_id": null
      }
    ]
  }
}
```

- **에러**
  - 400 `{ "errorCode": "SU000", "msg": "Invalid user ID", "data": {} }`
  - 404 `{ "errorCode": "SU000", "msg": "User not found", "data": {} }` (소프트 삭제 포함)
  - 500 `{ "errorCode": "SU000", "msg": "Failed to fetch user detail", "data": {} }`

### GET `/api/users/{userId}/collections`

- **토큰**: 선택
- **Path**
  - `userId` (number)
- **동작**
  - 본인 요청 시: `is_public` 관계없이 전체 반환
  - 타인 요청 시: `is_public: true`인 컬렉션만 반환
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { collections: any[] } }`
- **에러**
  - 400 `{ "errorCode": "SU000", "msg": "Invalid user ID", "data": {} }`
  - 404 `{ "errorCode": "SU000", "msg": "User not found", "data": {} }` (소프트 삭제 포함)

## Keywords

### POST `/api/keywords`

- **토큰**: 필수
- **용도**
  - 현재 키워드는 셀렉션 생성/수정 시 서버가 `keywordinfo`에 자동 저장하므로, 클라이언트에서 별도 호출할 필요가 없습니다.
  - 호환/관리 목적의 엔드포인트로 남겨둡니다.
- **Body**
  - `keywords` (string[], required)
  - `category_id` (number, required)
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { keywords: { keyword_name: string, keyword_id: number }[] } }`
- **에러**
  - 400 `{ "errorCode": "SU000", "msg": "keywords array and category_id are required", "data": {} }`

---

## Collections

### POST `/api/collections`

- **토큰**: 필수
- **Content-Type**: `multipart/form-data`
- **Body**
  - `category_id` (number, required)
  - `title` (string, required)
  - `description` (string, optional)
  - `tags` (JSON string, optional)
  - `is_public` (string `"true"` | `"false"`, optional, default `"true"`)
- **커버 이미지**
  - 컬렉션 커버(`collections.image_id`)는 **셀렉션 이미지(`selection_images.image_id`)를 재사용**하도록 서버에서 자동 설정합니다.
  - 따라서 컬렉션 생성 시 `image` 파일 업로드는 사용하지 않습니다.
- **응답 201**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { "success": true } }`
- **에러**
  - 400 `{ "errorCode": "SU000", "msg": "category_id and title are required", "data": {} }`

### GET `/api/collections/{collectionId}`

- **토큰**: 선택
- **Path**
  - `collectionId` (number)
- **동작**
  - `is_public: false`인 컬렉션은 소유자 본인만 조회 가능, 타인 요청 시 404
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { collection: { ..., image_id, has_liked: boolean } } }`
- **에러**
  - 400 `{ "errorCode": "SU000", "msg": "Invalid collection ID", "data": {} }`
  - 404 `{ "errorCode": "SU000", "msg": "Collection not found", "data": {} }`

### PATCH `/api/collections/{collectionId}`

- **토큰**: 필수
- **Content-Type**: `multipart/form-data`
- **Body**
  - `category_id` (number, optional)
  - `title` (string, optional)
  - `description` (string, optional)
  - `tags` (JSON string, optional)
  - `is_public` (string `"true"` | `"false"`, optional)
- **커버 이미지**
  - 컬렉션 커버는 서버에서 자동으로 관리하므로 `image` 업로드로 변경하지 않습니다.
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { "success": true } }`

### DELETE `/api/collections/{collectionId}`

- **토큰**: 필수
- **Body**: 없음
- **동작**
  - 컬렉션 대표 이미지 및 하위 셀렉션 이미지 전체 삭제 (S3 + DB)
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { "success": true } }`

### POST `/api/collections/{collectionId}/like`

- **토큰**: 필수
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { "success": true } }`

### DELETE `/api/collections/{collectionId}/like`

- **토큰**: 필수
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { "success": true } }`

### GET `/api/collections/{collectionId}/title`

- **토큰**: 불필요
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { title: string } }`

### GET `/api/collections/search`

- **토큰**: 선택
- **Query**
  - `q` (string, required)
  - `type` (`keyword` | `tag`, optional, default `keyword`)
- **동작**
  - `keyword`: `keywordinfo` ILIKE `%q%` → `primary_keywords @> [{"keyword_id": N}]` (public만)
  - `tag`: `tags @> ["q"]` (exact match, public만)
  - 로그인 시: 차단한 유저 제외, 본인 제외
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { collections: any[] } }`

### GET `/api/collections/ranking`

- **토큰**: 선택
- **동작**
  - `is_public: true` 조건
  - category_id별 무작위 최대 10개 (Fisher-Yates shuffle)
  - 로그인 시: 차단한 유저 제외
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { collections: any[] } }`

---

## Selections (컬렉션 하위)

### GET `/api/collections/{collectionId}/selections`

- **토큰**: 선택
- **동작**
  - 부모 컬렉션이 `is_public: false`이면 소유자 본인만 조회 가능, 타인 요청 시 404
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { selections: SelectionListItem[] } }`
  - 각 항목 필드:
    - `category_id` (number)
    - `collection_id` (number)
    - `selection_id` (number)
    - `title` (string)
    - `keywords` (object[]) — `[{ keyword_id, keyword_name }]`
    - `owner_name` (string)
    - `owner_id` (number)
    - `is_selecting` (boolean)
    - `selection_images` (object[]) — `[{ image_id, sort_order }]`
    - `thumb_image_id` (string | null) — `selection_images` 중 `sort_order`가 가장 낮은 이미지의 `image_id`

### POST `/api/collections/{collectionId}/selections`

- **토큰**: 필수
- **Content-Type**: `multipart/form-data`
- **Body**
  - `category_id` (number, required)
  - `title` (string, required)
  - `description` (string, optional)
  - `images` (File, optional, 반복 가능) — 여러 이미지를 같은 키 `images`로 반복 전송. `sort_order`는 전송 순서.
  - `keywords` (JSON string, required) — **빈 배열 불가**, 예: `'["키워드1","키워드2"]'`
  - `link` (string, optional)
  - `items` (JSON string, optional)
  - `is_ordered` (string `"true"` | `"false"`, optional; 기본 `"false"`)
  - `is_selectable` (string `"true"` | `"false"`, optional; 기본 `"true"`)
- **keywords 저장 방식**
  - 전달된 키워드 이름을 `keywordinfo` 테이블에 upsert 후 `keyword_id`를 조회
  - `selections.keywords`에 `[{"keyword_id": N, "keyword_name": "..."}]` 형식으로 저장
- **응답 201**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { "success": true } }`
- **에러**
  - 400 `{ "errorCode": "SU000", "msg": "category_id and title are required", "data": {} }`
  - 400 `{ "errorCode": "SU000", "msg": "keywords is required", "data": {} }`
  - 400 `{ "errorCode": "SU000", "msg": "keywords must be a non-empty JSON array of strings", "data": {} }`

### GET `/api/collections/{collectionId}/selections/{selectionId}`

- **토큰**: 불필요
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { selection: { ..., selection_images: { image_id, sort_order }[] } } }`
- **에러**
  - 404 `{ "errorCode": "SU000", "msg": "Selection not found", "data": {} }`

### PATCH `/api/collections/{collectionId}/selections/{selectionId}`

- **토큰**: 필수
- **Content-Type**: `multipart/form-data`
- **Body**
  - `category_id` (number, optional)
  - `title` (string, optional)
  - `description` (string, optional)
  - `keywords` (JSON string, required) — **빈 배열 불가**, 예: `'["키워드1","키워드2"]'`
  - `link` (string, optional)
  - `items` (JSON string, optional)
  - `is_ordered` (string `"true"` | `"false"`, optional)
  - `is_selectable` (string `"true"` | `"false"`, optional)
  - `images` (File, optional, 반복 가능) — 새로 추가할 이미지
  - `keep_image_ids` (JSON string, optional) — 유지할 기존 `image_id` 배열. 명시된 ID 외 기존 이미지는 삭제됨. 필드 자체가 없으면 이미지 변경 없음. 빈 배열(`"[]"`)이면 기존 이미지 전체 삭제.
- **keywords 저장 방식**
  - 전달된 키워드 이름을 `keywordinfo`에 upsert 후 `[{"keyword_id": N, "keyword_name": "..."}]` 형식으로 저장
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { "success": true } }`
- **이미지 업데이트 예시**
  - 이미지 추가만: `images`만 전송
  - 특정 이미지 삭제: `keep_image_ids`에 유지할 ID만 포함
  - 전체 교체: `keep_image_ids: "[]"` + `images`

### DELETE `/api/collections/{collectionId}/selections/{selectionId}`

- **토큰**: 필수
- **동작**
  - 셀렉션 이미지 전체 삭제 (S3 + DB) 후 셀렉션 삭제
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { "success": true } }`
 - **에러**
  - 400 `{ "errorCode": "SU000", "msg": "keywords is required", "data": {} }`
  - 400 `{ "errorCode": "SU000", "msg": "keywords must be a non-empty JSON array of strings", "data": {} }`

### PATCH `/api/collections/{collectionId}/selections/{selectionId}/move`

- **토큰**: 필수
- **Body**
  - `new_collection_id` (number, required)
  - `category_id` (number, optional)
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { "success": true } }`

---

## Selections (검색/랭킹)

### GET `/api/selections/search`

- **토큰**: 선택
- **Query**
  - `q` (string, required)
- **동작**
  - `keywordinfo` ILIKE `%q%` → `keywords @> [{"keyword_id": N}]`
  - 로그인 시: 본인 제외, 차단한 유저 제외
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { selections: any[] } }` (`image_id` 포함)

### GET `/api/selections/ranking`

- **토큰**: 선택
- **동작**
  - public 컬렉션 소속 셀렉션, `select_num` 내림차순
  - category_id별 상위 10개
  - 로그인 시: 차단한 유저 제외
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { selections: any[] } }` (`image_id` 포함)

---

## Selectings

### GET `/api/selectings`

- **토큰**: 필수
- **Query**
  - `properties` (string, optional, default `"*"`) — `selectingview`에서 select할 컬럼
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { selectings: any[] } }` (항상 배열)

### POST `/api/selectings` (셀렉션 퍼오기)

- **토큰**: 필수
- **Body**
  - `category_id` (number)
  - `selecting_collection_id` (number)
  - `selected_collection_id` (number)
  - `selected_selection_id` (number)
- **응답 201**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { "success": true } }`
- **에러**
  - 404 `{ "errorCode": "SU000", "msg": "Source selection not found", "data": {} }`

---

## Reports

### POST `/api/reports`

- **토큰**: 필수
- **Body**
  - `report_type` (number, required)
  - `reported_post_id` (object, required) — `{ [key: string]: number }`
  - `report_reason` (string, required)
- **응답 201**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { "success": true } }`

---

## Membership

### DELETE `/api/membership` (회원 탈퇴)

- **토큰**: 필수
- **응답 200**
  - `{ "errorCode": "SU000", "msg": "ok", "data": { "success": true } }`
- **동작**
  - 프로필 이미지 삭제 (S3 + DB)
  - 유저를 **소프트 삭제** 처리합니다(`userinfo.deleted_at` 설정)
  - 컬렉션/셀렉션 데이터는 유지됩니다
  - 이후 `user_id`로 해당 유저 조회 시 `404`가 반환됩니다
