# Collecter API

Next.js App Router 기반 API 문서입니다. (경로: `src/app/api/**/route.ts`)

## 인증 (Token)

- **헤더**: `Authorization: Bearer <access_token>`
- **토큰 발급**
  - `POST /api/auth/otp/verify` → `verified_token` 발급 (단기)
  - `POST /api/auth/login` 또는 `POST /api/signup` → `access_token` + `refresh_token` 발급
- **토큰 필요 여부 표기**
  - **필수**: 토큰 없으면 `401 { error: "Unauthorized" }`
  - **선택**: 토큰이 있으면 개인화(예: 차단 유저 제외, 좋아요 여부 계산) 반영
  - **불필요**: 인증 없이 호출 가능

## 공통 에러 응답

- **401 Unauthorized**: `{ "error": "Unauthorized" }`
- 그 외 `400/404/500`은 라우트별로 `{ "error": "<message>" }` 형태를 주로 사용합니다.

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
  - `{ success: boolean }` (`true`면 사용 가능, `false`면 이미 사용 중)
- **에러**
  - 400 `{ error: "email parameter is required" }`

### GET `/api/auth/check-username`

- **토큰**: 불필요
- **Query**
  - `username` (string, required)
- **응답 200**
  - `{ success: boolean }` (`true`면 사용 가능, `false`면 이미 사용 중)
- **에러**
  - 400 `{ error: "username parameter is required" }`

### POST `/api/auth/otp/send`

- **토큰**: 불필요
- **Body**
  - `email` (string, required)
  - `shouldCreateUser` (boolean, optional, default `false`) — `true`면 해당 이메일 유저가 없을 때 생성
- **응답 200**
  - `{ success: true }`
- **에러**
  - 400 `{ error: "email is required" }`
  - 500 `{ error: "Failed to send OTP" }`

### POST `/api/auth/otp/verify`

- **토큰**: 불필요
- **Body**
  - `email` (string, required)
  - `token` (string, required) — 이메일 OTP 코드
- **응답 200**
  - `{ verified_token: string, is_new_user: boolean }`
- **에러**
  - 400 `{ error: "email and token are required" }`
  - 400 `{ error: "Invalid OTP" }`
  - 404 `{ error: "User info not found" }`
  - 500 `{ error: "Server error" }`

### POST `/api/auth/login`

- **토큰**: 불필요
- **Body**
  - `verified_token` (string, required) — `POST /api/auth/otp/verify` 결과
- **응답 200**
  - `{ access_token: string, refresh_token: string }`
- **에러**
  - 400 `{ error: "verified_token is required" }`
  - 400 `{ error: "Invalid or expired verified_token" }` 또는 `{ error: "Invalid verified_token" }`

### POST `/api/auth/logout`

- **토큰**: 필수
- **Body**
  - `refresh_token` (string, required)
- **응답 200**
  - `{ success: true }`
- **에러**
  - 400 `{ error: "refresh_token is required" }`
  - 400 `{ error: "Invalid refresh token" }`
  - 500 `{ error: "Failed to logout" }`

### POST `/api/auth/refresh`

- **토큰**: 불필요
- **Body**
  - `refresh_token` (string, required)
- **응답 200**
  - `{ access_token: string, refresh_token: string }` (refresh 토큰은 회전되어 새로 발급됩니다)
- **에러**
  - 400 `{ error: "refresh_token is required" }` 또는 `{ error: "Invalid refresh token" }`
  - 401 `{ error: "Unauthorized" }` (세션 만료/폐기 등)

### DELETE `/api/auth/delete`

- **토큰**: 필수
- **Body**: 없음
- **응답 200**
  - `{ success: true }`
- **에러**
  - 500 `{ error: "Failed to delete user" }`

---

## Users

### GET `/api/users/me`

- **토큰**: 필수
- **응답 200**
  - `{ user: { user_id, name, email, description, image_file_path, image_id, images: { file_path } | null } }`

### PATCH `/api/users/me` (프로필 수정)

- **토큰**: 필수
- **Content-Type**: `multipart/form-data`
- **Body**
  - `name` (string, required)
  - `description` (string, optional)
  - `image` (File, optional) — 새 프로필 이미지. 기존 이미지는 자동 삭제됩니다.
- **응답 200**
  - `{ success: true }`
- **에러**
  - 400 `{ error: "name is required" }`
  - 500 `{ error: "Failed to upload image" }`

### GET `/api/users/me/likes`

- **토큰**: 필수
- **응답 200**
  - `{ collections: any[] }`

### GET `/api/users/me/blocks`

- **토큰**: 필수
- **응답 200**
  - `{ blocked_user_ids: number[] }`

### POST `/api/users/me/blocks`

- **토큰**: 필수
- **Body**
  - `blocked_user_id` (number, required)
- **응답 200**
  - `{ success: true }`
- **에러**
  - 400 `{ error: "blocked_user_id is required" }`

### GET `/api/users/me/collections`

- **토큰**: 필수
- **응답 200**
  - `{ collections: any[] }`

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
  - `{ access_token: string, refresh_token: string }`
- **에러**
  - 400 `{ error: "verified_token is required" }`
  - 400 `{ error: "email and name are required" }`
  - 400 `{ error: "Invalid or expired verified_token" }` 또는 `{ error: "Invalid verified_token" }`
  - 500 `{ error: "Failed to upload image" }`
  - 500 `{ error: "Failed to signup" }`

### GET `/api/users/search`

- **토큰**: 불필요
- **Query**
  - `q` (string, required)
- **응답 200**
  - `{ users: UserInfo[] }` (RPC `search_users`, **소프트 삭제된 유저는 제외**)
- **에러**
  - 400 `{ error: "Query parameter 'q' is required" }`

### GET `/api/users/ranking`

- **토큰**: 선택
- **Query**: 없음
- **동작**
  - 토큰이 있으면 내가 차단한 유저는 제외하고 10명 반환
  - **소프트 삭제된 유저는 제외**
- **응답 200**
  - `{ users: any[] }`

### GET `/api/users/{userId}`

- **토큰**: 불필요
- **Path**
  - `userId` (number)
- **응답 200**
  - `{ user: { user_id, name, description, image_file_path, image_id, images: { file_path } | null } }`
- **에러**
  - 400 `{ error: "Invalid user ID" }`
  - 404 `{ error: "User not found" }` (소프트 삭제 포함)

### GET `/api/users/{userId}/collections`

- **토큰**: 선택
- **Path**
  - `userId` (number)
- **동작**
  - 본인 요청 시: `is_public` 관계없이 전체 반환
  - 타인 요청 시: `is_public: true`인 컬렉션만 반환
- **응답 200**
  - `{ collections: any[] }`
- **에러**
  - 400 `{ error: "Invalid user ID" }`
  - 404 `{ error: "User not found" }` (소프트 삭제 포함)

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
  - `{ keywords: { keyword_name: string, keyword_id: number }[] }`
- **에러**
  - 400 `{ error: "keywords array and category_id are required" }`

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
  - `{ success: true }`
- **에러**
  - 400 `{ error: "category_id and title are required" }`

### GET `/api/collections/{collectionId}`

- **토큰**: 선택
- **Path**
  - `collectionId` (number)
- **동작**
  - `is_public: false`인 컬렉션은 소유자 본인만 조회 가능, 타인 요청 시 404
- **응답 200**
  - `{ collection: { ..., image_id, images: { image_id, file_path } | null, has_liked: boolean } }`
- **에러**
  - 400 `{ error: "Invalid collection ID" }`
  - 404 `{ error: "Collection not found" }`

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
  - `{ success: true }`

### DELETE `/api/collections/{collectionId}`

- **토큰**: 필수
- **Body**: 없음
- **동작**
  - 컬렉션 대표 이미지 및 하위 셀렉션 이미지 전체 삭제 (S3 + DB)
- **응답 200**
  - `{ success: true }`

### POST `/api/collections/{collectionId}/like`

- **토큰**: 필수
- **응답 200**
  - `{ success: true }`

### DELETE `/api/collections/{collectionId}/like`

- **토큰**: 필수
- **응답 200**
  - `{ success: true }`

### GET `/api/collections/{collectionId}/title`

- **토큰**: 불필요
- **응답 200**
  - `{ title: string }`

### GET `/api/collections/search`

- **토큰**: 불필요
- **Query**
  - `q` (string, required)
  - `type` (`keyword` | `tag`, optional, default `keyword`)
- **응답 200**
  - `{ collections: any[] }`

### GET `/api/collections/ranking`

- **토큰**: 선택
- **응답 200**
  - `{ collections: any }` (RPC `get_ranking_collections`)

---

## Selections (컬렉션 하위)

### GET `/api/collections/{collectionId}/selections`

- **토큰**: 선택
- **동작**
  - 부모 컬렉션이 `is_public: false`이면 소유자 본인만 조회 가능, 타인 요청 시 404
- **응답 200**
  - `{ selections: { ..., selection_images: { image_id, sort_order, images: { file_path } }[], thumb_file_path: string | null }[] }`
  - `thumb_file_path`: `selection_images` 중 `sort_order` 가장 낮은 이미지의 `file_path`

### POST `/api/collections/{collectionId}/selections`

- **토큰**: 필수
- **Content-Type**: `multipart/form-data`
- **Body**
  - `category_id` (number, required)
  - `title` (string, required)
  - `description` (string, optional)
  - `images` (File, optional, 반복 가능) — 여러 이미지를 같은 키 `images`로 반복 전송. `sort_order`는 전송 순서.
  - `keywords` (JSON string, required) — **빈 배열 불가**
  - `link` (string, optional)
  - `items` (JSON string, optional)
  - `is_ordered` (string `"true"` | `"false"`, optional; 기본 `"false"`)
  - `is_selectable` (string `"true"` | `"false"`, optional; 기본 `"true"`)
- **응답 201**
  - `{ success: true }`
- **에러**
  - 400 `{ error: "category_id and title are required" }`
  - 400 `{ error: "keywords is required" }`
  - 400 `{ error: "keywords must be a non-empty JSON array of strings" }`

### GET `/api/collections/{collectionId}/selections/{selectionId}`

- **토큰**: 불필요
- **응답 200**
  - `{ selection: { ..., selection_images: { image_id, sort_order, images: { file_path } }[] } }`
- **에러**
  - 404 `{ error: "Selection not found" }`

### PATCH `/api/collections/{collectionId}/selections/{selectionId}`

- **토큰**: 필수
- **Content-Type**: `multipart/form-data`
- **Body**
  - `category_id` (number, optional)
  - `title` (string, optional)
  - `description` (string, optional)
  - `keywords` (JSON string, required) — **빈 배열 불가**
  - `link` (string, optional)
  - `items` (JSON string, optional)
  - `is_ordered` (string `"true"` | `"false"`, optional)
  - `is_selectable` (string `"true"` | `"false"`, optional)
  - `images` (File, optional, 반복 가능) — 새로 추가할 이미지
  - `keep_image_ids` (JSON string, optional) — 유지할 기존 `image_id` 배열. 명시된 ID 외 기존 이미지는 삭제됨. 필드 자체가 없으면 이미지 변경 없음. 빈 배열(`"[]"`)이면 기존 이미지 전체 삭제.
- **응답 200**
  - `{ success: true }`
- **이미지 업데이트 예시**
  - 이미지 추가만: `images`만 전송
  - 특정 이미지 삭제: `keep_image_ids`에 유지할 ID만 포함
  - 전체 교체: `keep_image_ids: "[]"` + `images`

### DELETE `/api/collections/{collectionId}/selections/{selectionId}`

- **토큰**: 필수
- **동작**
  - 셀렉션 이미지 전체 삭제 (S3 + DB) 후 셀렉션 삭제
- **응답 200**
  - `{ success: true }`
 - **에러**
  - 400 `{ error: "keywords is required" }`
  - 400 `{ error: "keywords must be a non-empty JSON array of strings" }`

### PATCH `/api/collections/{collectionId}/selections/{selectionId}/move`

- **토큰**: 필수
- **Body**
  - `new_collection_id` (number, required)
  - `category_id` (number, optional)
- **응답 200**
  - `{ success: true }`

---

## Selections (검색/랭킹)

### GET `/api/selections/search`

- **토큰**: 불필요
- **Query**
  - `q` (string, required)
- **응답 200**
  - `{ selections: any[] }` (`thumb_file_path` 포함)

### GET `/api/selections/ranking`

- **토큰**: 선택
- **응답 200**
  - `{ selections: any[] }` (`thumb_file_path` 포함)

---

## Selectings

### GET `/api/selectings`

- **토큰**: 필수
- **Query**
  - `properties` (string, optional, default `"*"`) — `selectingview`에서 select할 컬럼
- **응답 200**
  - `{ selectings: any[] }` (항상 배열)

### POST `/api/selectings` (셀렉션 퍼오기)

- **토큰**: 필수
- **Body**
  - `category_id` (number)
  - `selecting_collection_id` (number)
  - `selected_collection_id` (number)
  - `selected_selection_id` (number)
- **응답 201**
  - `{ success: true }`
- **에러**
  - 404 `{ error: "Source selection not found" }`

---

## Reports

### POST `/api/reports`

- **토큰**: 필수
- **Body**
  - `report_type` (number, required)
  - `reported_post_id` (object, required) — `{ [key: string]: number }`
  - `report_reason` (string, required)
- **응답 201**
  - `{ success: true }`

---

## Membership

### DELETE `/api/membership` (회원 탈퇴)

- **토큰**: 필수
- **응답 200**
  - `{ success: true }`
- **동작**
  - 프로필 이미지 삭제 (S3 + DB)
  - 유저를 **소프트 삭제** 처리합니다(`userinfo.deleted_at` 설정)
  - 컬렉션/셀렉션 데이터는 유지됩니다
  - 이후 `user_id`로 해당 유저 조회 시 `404`가 반환됩니다
