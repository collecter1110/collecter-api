# Collecter API

Next.js App Router 기반 API 문서입니다. 실제 라우트 경로는 `src/app/**/route.ts` 기준이며 `/api` prefix를 붙이지 않습니다.

## 공통

- 인증 헤더: `Authorization: Bearer <access_token>`
- 공통 응답:

```json
{
  "errorCode": "SU000",
  "msg": "ok",
  "data": {}
}
```

- 에러 응답도 같은 형태를 사용하며 `data`는 `{}`입니다.
- 이미지가 있는 쓰기 요청은 `multipart/form-data`를 사용합니다.
- 단일 이미지 필드명은 `image`, 다중 이미지 필드명은 `images`입니다.

## 인증 흐름

1. `POST /auth/otp/send`, `POST /auth/oauth/google`, `POST /auth/oauth/apple` 중 하나로 인증을 시작합니다.
2. OTP는 `POST /auth/otp/verify`로 검증합니다.
3. 반환된 `verified_token`을 `POST /auth/login`에 전달해 `access_token`, `refresh_token`을 발급받습니다.
4. 신규 유저 또는 약관 미동의 유저는 `POST /auth/login`에 `terms_agreed: true`를 함께 전달합니다.

## Auth

### GET `/auth/check-username`

- 토큰: 불필요
- Query: `username` (string, required)
- 응답: `{ "success": true }`이면 사용 가능, `false`이면 이미 사용 중

```bash
curl -X GET "https://<host>/auth/check-username?username=gimgahui"
```

### POST `/auth/otp/send`

- 토큰: 불필요
- Body: `email` (string, required)
- 참고: `shouldCreateUser`는 deprecated 되었고 무시됩니다.

```bash
curl -X POST "https://<host>/auth/otp/send" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
```

### POST `/auth/otp/verify`

- 토큰: 불필요
- Body: `email` (string, required), `token` (string, required)
- 응답: `verified_token`, `is_new_user`, `terms_agreed`

```bash
curl -X POST "https://<host>/auth/otp/verify" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","token":"123456"}'
```

### POST `/auth/oauth/google`

- 토큰: 불필요
- Body: `id_token` (string, required)
- 응답: `verified_token`, `is_new_user`, `terms_agreed`

### POST `/auth/oauth/apple`

- 토큰: 불필요
- Body: `identity_token` (string, required), `email` (string, optional)
- 응답: `verified_token`, `is_new_user`, `terms_agreed`
- 참고: Apple은 첫 로그인 시에만 이메일을 제공합니다. JWT에 email이 없으면 body의 `email`을 사용합니다.

### POST `/auth/login`

- 토큰: 불필요
- Body: `verified_token` (string, required), `terms_agreed` (boolean, optional)
- 응답: `user_id`, `access_token`, `refresh_token`

```bash
curl -X POST "https://<host>/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"verified_token":"<verified_token>","terms_agreed":true}'
```

### POST `/auth/logout`

- 토큰: 필수
- Body: `refresh_token` (string, required), `fcm_token` (string, optional)
- 동작: refresh session을 폐기합니다. `fcm_token`을 함께 보내면 **이 기기의** FCM 토큰도 삭제합니다.
- 멱등: 이미 만료·변조된 `refresh_token`을 보내도 폐기할 세션이 없을 뿐이라 200으로 응답합니다.
- 참고: `fcm_token`을 보내지 않으면 토큰이 남아 로그아웃한 기기로 계속 알림이 갑니다. 같은 유저가 다른 기기에 로그인해 있어도 그쪽 알림은 유지됩니다.

### POST `/auth/refresh`

- 토큰: 불필요
- Body: `refresh_token` (string, required)
- 응답: 새 `access_token`, 새 `refresh_token`
- 실패: 재발급이 불가능한 경우(토큰 누락·만료·변조, 세션 폐기·만료)는 **모두 401**입니다.
  일시적 장애만 5xx로 나가므로, 클라이언트는 401을 받으면 로컬 토큰을 지우고 로그아웃하면 됩니다.

### DELETE `/auth/delete`

- 토큰: 필수
- 동작: 계정과 관련 데이터를 hard delete 합니다. `userinfo` 삭제 후 FK cascade로 컬렉션, 셀렉션, 좋아요, 차단 등 연관 데이터가 정리됩니다.

## Users

### GET `/users/me`

- 토큰: 필수
- 응답: 내 프로필 정보. `push_enabled`도 여기서 조회합니다.

### PATCH `/users/me`

- 토큰: 필수
- Content-Type: `multipart/form-data`
- Body: `user_name` (string, required), `description` (string, optional), `image` (File, optional)

### GET `/users/me/stats`

- 토큰: 필수
- 응답: 내 취향 통계

### GET `/users/me/categories`

- 토큰: 필수
- 응답: 내 관심 카테고리 랭킹

### GET `/users/me/keywords`

- 토큰: 필수
- 응답: 내 키워드 랭킹

### GET `/users/me/likes`

- 토큰: 필수
- 응답: 내가 좋아요한 컬렉션 목록

### GET `/users/me/blocks`

- 토큰: 필수
- 응답: `blocked_user_ids`

### POST `/users/me/blocks`

- 토큰: 필수
- Body: `blocked_user_id` (number, required)

### GET `/users/me/collections`

- 토큰: 필수
- 응답: 내 컬렉션 목록

### GET `/users/search`

- 토큰: 선택
- Query: `q` (string, required)
- 동작: 유저명 검색. 토큰이 있으면 차단 관계를 반영합니다.

### GET `/user/detail`

- 토큰: 선택
- Query: `user_id` (number, required)
- 동작: 본인은 공개/비공개 컬렉션을 모두 보고, 타인은 공개 컬렉션만 봅니다.

### POST `/users/fcm-token`

- 토큰: 필수
- Body: `fcm_token` (string, required), `platform` (`ios` | `android`, required)
- 동작: FCM 기기 토큰을 등록 또는 갱신합니다.

### DELETE `/users/fcm-token`

- 토큰: 필수
- Body: `fcm_token` (string, required)
- 동작: 로그아웃/탈퇴 시 기기 토큰을 삭제합니다. 등록된 토큰이 없어도 200을 반환합니다.

### PATCH `/users/alarm`

- 토큰: 필수
- Body: `push_enabled` (boolean, required)
- 현재 값 조회: `GET /users/me` 응답의 `push_enabled`

## Collections

컬렉션 조회 응답은 DB `collections.id`를 `collection_id`, DB `collections.title`을 `collection_title`로 내려줍니다. 쓰기 요청 body는 DB 컬럼명에 맞춰 `title` 등을 사용합니다.

### POST `/collections`

- 토큰: 필수
- Content-Type: `multipart/form-data`
- Body: `category_id` (number, required), `title` (string, required), `description` (string, optional), `tags` (JSON string, optional), `is_public` (`"true"` | `"false"`, optional)

### GET `/collections/{collectionId}`

- 토큰: 선택
- 동작: 컬렉션 상세 조회. 비공개 컬렉션은 소유자만 조회할 수 있습니다.

### PATCH `/collections/{collectionId}`

- 토큰: 필수
- Content-Type: `multipart/form-data`
- Body: `title`, `description`, `tags`, `is_public` 등 수정 필드

### DELETE `/collections/{collectionId}`

- 토큰: 필수
- 동작: 컬렉션 삭제

### POST `/collections/{collectionId}/like`

- 토큰: 필수
- 동작: 컬렉션 좋아요

### DELETE `/collections/{collectionId}/like`

- 토큰: 필수
- 동작: 컬렉션 좋아요 취소

### GET `/collections/search`

- 토큰: 선택
- Query: `q` (string, required), `type` (`title` | `keyword`, optional)
- 동작: 공개 컬렉션에서 제목 또는 primary keywords 기준 검색

### GET `/collections/ranking`

- 토큰: 선택
- 동작: 공개 컬렉션 랭킹 목록. 토큰이 있으면 차단한 유저의 컬렉션을 제외합니다.

### GET `/collections/recent`

- 토큰: 선택
- Query: `category_id` (number, optional), `page` (number, optional), `size` (number, optional)
- 동작: 공개 컬렉션 최신순 목록

## Collection Selections

### GET `/collections/{collectionId}/selections`

- 토큰: 선택
- 동작: 컬렉션의 셀렉션 목록 조회

### POST `/collections/{collectionId}/selections`

- 토큰: 필수
- Content-Type: `multipart/form-data`
- Body: `category_id` (number, required), `title` (string, required), `keywords` (JSON string, required), `description`, `images`, `link`, `items`, `is_ordered`, `is_selectable`

## Selections

### GET `/selections/{id}`

- 토큰: 선택
- 동작: 셀렉션 상세 조회. 비공개 컬렉션의 셀렉션은 접근 제한됩니다.

### PATCH `/selections/{id}`

- 토큰: 필수
- Content-Type: `multipart/form-data`
- Body: `title`, `description`, `keywords`, `images`, `link`, `items`, `is_ordered`, `is_selectable` 등 수정 필드

### DELETE `/selections/{id}`

- 토큰: 필수
- 동작: 소유자만 삭제 가능

### PATCH `/selections/{id}/move`

- 토큰: 필수
- Body: `collection_id` (number, required), `sort_order` (number, optional)
- 동작: 셀렉션을 다른 컬렉션으로 이동

### GET `/selections/search`

- 토큰: 선택
- Query: `q` (string, required)
- 동작: 공개 셀렉션 검색

### GET `/selections/ranking`

- 토큰: 선택
- 동작: 공개 셀렉션 랭킹 목록

### GET `/selections/recent`

- 토큰: 선택
- Query: `category_id` (number, optional), `page` (number, optional), `size` (number, optional)
- 동작: 공개 셀렉션 최신순 목록

## Public

### GET `/public/collections/{collectionId}`

- 토큰: 불필요
- 동작: 공개 컬렉션 상세 조회

### GET `/public/collections/{collectionId}/selections`

- 토큰: 불필요
- 동작: 공개 컬렉션의 셀렉션 목록 조회

### GET `/public/collections/{collectionId}/selections/{sid}`

- 토큰: 불필요
- 동작: 공개 셀렉션 상세 조회

## Selectings

### GET `/selectings`

- 토큰: 필수
- Query: `properties` (string, optional)
- 동작: 내가 셀렉팅한 목록 조회

### POST `/selectings`

- 토큰: 필수
- Body: `selection_id` (number, required), `collection_id` (number, required)
- 동작: 다른 셀렉션을 내 컬렉션으로 퍼오기

### DELETE `/selectings`

- 토큰: 필수
- Body: `selection_id` (number, required), `collection_id` (number, required)
- 동작: 퍼온 셀렉션 취소

### GET `/selected`

- 토큰: 필수
- 동작: 다른 유저가 내 셀렉션을 퍼간 목록 조회

## Reports

### POST `/reports`

- 토큰: 필수
- Body: `report_type` (number, required), `reported_post_id` (object, required), `report_reason` (string, required)

## Membership

### DELETE `/membership` (Deprecated)

- 토큰: 필수
- 상태: deprecated
- 동작: 유저를 soft delete 처리합니다(`userinfo.deleted_at` 설정). 신규 탈퇴 흐름은 `DELETE /auth/delete` 기준으로 정리합니다.
