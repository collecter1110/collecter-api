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

---

## Auth

### GET `/api/auth/check-email`

- **토큰**: 불필요
- **Query**
  - `email` (string, required)
- **응답 200**
  - `{ available: boolean }` (`true`면 사용 가능)
- **에러**
  - 400 `{ error: "email parameter is required" }`

### GET `/api/auth/check-username`

- **토큰**: 불필요
- **Query**
  - `username` (string, required)
- **응답 200**
  - `{ available: boolean }`
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
  - `{ user: { user_id: number, name: string, email: string, description: string | null, image_file_path: string | null } }`

### PATCH `/api/users/me` (프로필 수정)

- **토큰**: 필수
- **Body**
  - `name` (string, required)
  - `description` (string, optional)
  - `image_file_path` (string, optional)
- **응답 200**
  - `{ success: true }`
- **에러**
  - 400 `{ error: "name is required" }`

### GET `/api/users/me/likes`

- **토큰**: 필수
- **응답 200**
  - `{ collections: any[] }` (likes join 결과에서 `collections(*)`만 추출)

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
  - `{ collections: any }`
- **주의**
  - 현재 구현은 `.select("")`로 되어 있어 반환 shape/필드가 의도와 다를 수 있습니다.

---

## Signup

### POST `/api/signup`

- **토큰**: 불필요
- **Body**
  - `verified_token` (string, required) — `POST /api/auth/otp/verify` 결과
  - `email` (string, required)
  - `name` (string, required)
  - `description` (string, optional)
  - `image_file_path` (string, optional)
- **응답 200**
  - `{ access_token: string, refresh_token: string }`
- **에러**
  - 400 `{ error: "verified_token is required" }`
  - 400 `{ error: "email and name are required" }`
  - 400 `{ error: "Invalid or expired verified_token" }` 또는 `{ error: "Invalid verified_token" }`
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
  - `{ user: { user_id: number, name: string, description: string | null, image_file_path: string | null } }`
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

---

## Categories

### GET `/api/categories`

- **토큰**: 불필요
- **응답 200**
  - `{ categories: any[] }`

---

## Keywords

### POST `/api/keywords`

- **토큰**: 필수
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
- **Body**
  - `category_id` (number, required)
  - `title` (string, required)
  - `description` (string, optional)
  - `tags` (any, optional)
  - `is_public` (boolean, optional, default `true`)
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
  - `{ collection: { ...fields, has_liked: boolean } }`
- **에러**
  - 400 `{ error: "Invalid collection ID" }`
  - 404 `{ error: "Collection not found" }`

### PATCH `/api/collections/{collectionId}`

- **토큰**: 필수
- **Body**
  - `category_id` (number, optional)
  - `title` (string, optional)
  - `description` (string, optional)
  - `image_file_path` (string, optional)
  - `tags` (any, optional)
  - `is_public` (boolean, optional)
- **응답 200**
  - `{ success: true }`

### DELETE `/api/collections/{collectionId}`

- **토큰**: 필수
- **Body**: 없음
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
  - `{ selections: any[] }` (`thumb_file_path` 포함)

### POST `/api/collections/{collectionId}/selections`

- **토큰**: 필수
- **Body**
  - `category_id` (number, required)
  - `title` (string, required)
  - `description` (string, optional)
  - `image_file_paths` (string[], optional)
  - `keywords` (any, optional; 기본 `[]`)
  - `link` (string, optional)
  - `items` (any, optional)
  - `is_ordered` (boolean, optional; 기본 `false`)
  - `is_selectable` (boolean, optional; 기본 `true`)
- **응답 201**
  - `{ success: true }`

### GET `/api/collections/{collectionId}/selections/{selectionId}`

- **토큰**: 불필요
- **응답 200**
  - `{ selection: any }`
- **에러**
  - 404 `{ error: "Selection not found" }`

### PATCH `/api/collections/{collectionId}/selections/{selectionId}`

- **토큰**: 필수
- **Body**: selection 필드들(카테고리/제목/설명/이미지/키워드/링크/items/정렬/선택 가능 여부 등)
- **응답 200**
  - `{ success: true }`

### DELETE `/api/collections/{collectionId}/selections/{selectionId}`

- **토큰**: 필수
- **응답 200**
  - `{ success: true }`

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

### DELETE `/api/membership` (회원 탈퇴/멤버십 취소)

- **토큰**: 필수
- **응답 200**
  - `{ success: true }`
- **동작**
  - 유저를 **소프트 삭제** 처리합니다(`userinfo.deleted_at` 설정).
  - 컬렉션/셀렉션 데이터는 유지됩니다.
  - 이후 `user_id`로 해당 유저 조회 시 `404`가 반환됩니다.
