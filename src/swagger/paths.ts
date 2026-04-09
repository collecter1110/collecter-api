/**
 * @openapi
 * /api/auth/check-email:
 *   get:
 *     tags:
 *       - Auth
 *     summary: 이메일 중복 확인
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 성공 (success=true이면 사용 가능)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: 파라미터 없음
 *       500:
 *         description: 서버 오류
 *
 * /api/auth/check-username:
 *   get:
 *     tags:
 *       - Auth
 *     summary: 닉네임 중복 확인
 *     parameters:
 *       - in: query
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 성공 (success=true이면 사용 가능)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: 파라미터 없음
 *       500:
 *         description: 서버 오류
 *
 * /api/auth/delete:
 *   delete:
 *     tags:
 *       - Auth
 *     summary: 유저 계정 삭제 (Hard delete)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       401:
 *         description: 인증 필요
 *       500:
 *         description: 서버 오류
 *
 * /api/auth/login:
 *   post:
 *     tags:
 *       - Auth
 *     summary: 로그인 (verified_token → access/refresh token 발급)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - verified_token
 *             properties:
 *               verified_token:
 *                 type: string
 *                 description: OTP 인증 후 발급된 단기 토큰
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 access_token:
 *                   type: string
 *                 refresh_token:
 *                   type: string
 *       400:
 *         description: 잘못된 토큰
 *
 * /api/auth/logout:
 *   post:
 *     tags:
 *       - Auth
 *     summary: 로그아웃 (refresh session 폐기)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refresh_token
 *             properties:
 *               refresh_token:
 *                 type: string
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: 잘못된 토큰
 *       401:
 *         description: 인증 필요
 *       500:
 *         description: 서버 오류
 *
 * /api/auth/otp/send:
 *   post:
 *     tags:
 *       - Auth
 *     summary: OTP 발송 (회원가입/로그인 공용)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *               shouldCreateUser:
 *                 type: boolean
 *                 description: true이면 회원가입 흐름
 *     responses:
 *       200:
 *         description: OTP 발송 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: 이메일 없음
 *       500:
 *         description: 발송 실패
 *
 * /api/auth/otp/verify:
 *   post:
 *     tags:
 *       - Auth
 *     summary: OTP 검증 → verified_token 발급
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - token
 *             properties:
 *               email:
 *                 type: string
 *               token:
 *                 type: string
 *                 description: OTP 코드
 *     responses:
 *       200:
 *         description: 검증 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 verified_token:
 *                   type: string
 *                 is_new_user:
 *                   type: boolean
 *       400:
 *         description: 잘못된 OTP
 *       404:
 *         description: 유저 없음
 *       500:
 *         description: 서버 오류
 *
 * /api/auth/refresh:
 *   post:
 *     tags:
 *       - Auth
 *     summary: 토큰 갱신 (refresh token rotation)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refresh_token
 *             properties:
 *               refresh_token:
 *                 type: string
 *     responses:
 *       200:
 *         description: 새 토큰 발급
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 access_token:
 *                   type: string
 *                 refresh_token:
 *                   type: string
 *       400:
 *         description: 잘못된 토큰
 *       401:
 *         description: 세션 만료 또는 폐기됨
 *
 * /api/signup:
 *   post:
 *     tags:
 *       - Signup
 *     summary: 회원가입 (프로필 설정 + 토큰 발급)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - verified_token
 *               - email
 *               - name
 *             properties:
 *               verified_token:
 *                 type: string
 *               email:
 *                 type: string
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: 성공 (access/refresh token 반환)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 access_token:
 *                   type: string
 *                 refresh_token:
 *                   type: string
 *       400:
 *         description: 잘못된 요청
 *       500:
 *         description: 서버 오류
 *
 * /api/collections/ranking:
 *   get:
 *     tags:
 *       - Collections
 *     summary: Get ranking collections
 *     description: |
 *       `is_public: true` 이면서 `image_id`가 있는 컬렉션을 가져옵니다.
 *       category_id별로 무작위 셔플(Fisher-Yates) 후 최대 10개씩 반환합니다.
 *
 *       - Authorization 헤더가 있으면 차단한 유저의 컬렉션을 제외합니다. (토큰 선택)
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: false
 *         schema:
 *           type: string
 *         description: Bearer access token (optional)
 *         example: Bearer eyJhbGciOi...
 *     responses:
 *       200:
 *         description: Ranking collections
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [collections]
 *               properties:
 *                 collections:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/RankingCollection"
 *       500:
 *         description: Failed to fetch ranking collections
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *
 * /api/collections/search:
 *   get:
 *     tags:
 *       - Collections
 *     summary: 컬렉션 검색 (키워드 또는 태그)
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [keyword, tag]
 *           default: keyword
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [collections]
 *               properties:
 *                 collections:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/SearchCollection"
 *             examples:
 *               ok:
 *                 value:
 *                   collections:
 *                     - collection_id: 123
 *                       collection_title: "내 컬렉션"
 *                       image_id: "b7c6f3b0-6a0f-4b4a-9a90-2c02e4a2b9a1"
 *       400:
 *         description: 쿼리 없음
 *       500:
 *         description: 서버 오류
 *
 * /api/collections/{collectionId}:
 *   get:
 *     tags:
 *       - Collections
 *     summary: 컬렉션 상세 조회
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 collection:
 *                   type: object
 *       400:
 *         description: 잘못된 ID
 *       404:
 *         description: 컬렉션 없음
 *       500:
 *         description: 서버 오류
 *   patch:
 *     tags:
 *       - Collections
 *     summary: 컬렉션 수정
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               category_id:
 *                 type: integer
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               tags:
 *                 type: string
 *                 description: JSON 배열 문자열
 *               is_public:
 *                 type: string
 *                 description: 비공개이면 "false"
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: 잘못된 ID
 *       401:
 *         description: 인증 필요
 *       500:
 *         description: 서버 오류
 *   delete:
 *     tags:
 *       - Collections
 *     summary: 컬렉션 삭제
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: 잘못된 ID
 *       401:
 *         description: 인증 필요
 *       404:
 *         description: 컬렉션 없음
 *       500:
 *         description: 서버 오류
 *
 * /api/collections/{collectionId}/title:
 *   get:
 *     tags:
 *       - Collections
 *     summary: 컬렉션 제목 조회
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 title:
 *                   type: string
 *       400:
 *         description: 잘못된 ID
 *       404:
 *         description: 컬렉션 없음
 *       500:
 *         description: 서버 오류
 *
 * /api/collections/{collectionId}/like:
 *   post:
 *     tags:
 *       - Collections
 *     summary: 컬렉션 좋아요
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: 잘못된 ID
 *       401:
 *         description: 인증 필요
 *       500:
 *         description: 서버 오류
 *   delete:
 *     tags:
 *       - Collections
 *     summary: 컬렉션 좋아요 취소
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: 잘못된 ID
 *       401:
 *         description: 인증 필요
 *       500:
 *         description: 서버 오류
 *
 * /api/collections/{collectionId}/selections:
 *   get:
 *     tags:
 *       - Selections
 *     summary: 컬렉션의 셀렉션 목록 조회
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 selections:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: 잘못된 ID
 *       404:
 *         description: 컬렉션 없음
 *       500:
 *         description: 서버 오류
 *   post:
 *     tags:
 *       - Selections
 *     summary: 셀렉션 추가
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - category_id
 *               - title
 *               - keywords
 *             properties:
 *               category_id:
 *                 type: integer
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               keywords:
 *                 type: string
 *                 description: "JSON 배열 문자열 (예: [\"키워드1\",\"키워드2\"])"
 *               link:
 *                 type: string
 *               items:
 *                 type: string
 *                 description: JSON 배열 문자열
 *               is_ordered:
 *                 type: string
 *               is_selectable:
 *                 type: string
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: 생성됨
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 필요
 *       500:
 *         description: 서버 오류
 *
 * /api/collections/{collectionId}/selections/{selectionId}:
 *   get:
 *     tags:
 *       - Selections
 *     summary: 셀렉션 상세 조회
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: selectionId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 selection:
 *                   type: object
 *       400:
 *         description: 잘못된 ID
 *       404:
 *         description: 셀렉션 없음
 *       500:
 *         description: 서버 오류
 *   patch:
 *     tags:
 *       - Selections
 *     summary: 셀렉션 수정
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: selectionId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               category_id:
 *                 type: integer
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               keywords:
 *                 type: string
 *                 description: JSON 배열 문자열
 *               link:
 *                 type: string
 *               items:
 *                 type: string
 *                 description: JSON 배열 문자열
 *               is_ordered:
 *                 type: string
 *               is_selectable:
 *                 type: string
 *               keep_image_ids:
 *                 type: string
 *                 description: 유지할 기존 image_id JSON 배열. 빈 배열이면 전체 삭제
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 필요
 *       404:
 *         description: 셀렉션 없음
 *       500:
 *         description: 서버 오류
 *   delete:
 *     tags:
 *       - Selections
 *     summary: 셀렉션 삭제
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: selectionId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: 잘못된 ID
 *       401:
 *         description: 인증 필요
 *       500:
 *         description: 서버 오류
 *
 * /api/collections/{collectionId}/selections/{selectionId}/move:
 *   patch:
 *     tags:
 *       - Selections
 *     summary: 셀렉션 다른 컬렉션으로 이동
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: selectionId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - new_collection_id
 *             properties:
 *               new_collection_id:
 *                 type: integer
 *               category_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 필요
 *       500:
 *         description: 서버 오류
 *
 * /api/selections/ranking:
 *   get:
 *     tags:
 *       - Selections
 *     summary: Get ranking selections
 *     description: |
 *       public 컬렉션(`collections.is_public = true`)에 속한 셀렉션을 `select_num` 내림차순으로 정렬 후,
 *       category_id별 상위 10개씩 반환합니다.
 *
 *       - Authorization 헤더가 있으면 차단한 유저의 셀렉션을 제외합니다. (토큰 선택)
 *       - `image_id`는 `selection_images` 중 `sort_order`가 0인 이미지의 `image_id`입니다.
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: false
 *         schema:
 *           type: string
 *         description: Bearer access token (optional)
 *         example: Bearer eyJhbGciOi...
 *     responses:
 *       200:
 *         description: Ranking selections
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [selections]
 *               properties:
 *                 selections:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/RankingSelection"
 *       500:
 *         description: Failed to fetch ranking selections
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *
 * /api/selections/search:
 *   get:
 *     tags:
 *       - Selections
 *     summary: 셀렉션 키워드 검색
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [selections]
 *               properties:
 *                 selections:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/SearchSelection"
 *             examples:
 *               ok:
 *                 value:
 *                   selections:
 *                     - selection_id: 456
 *                       selection_title: "내 셀렉션"
 *                       image_id: "7c2c8fb0-4d1b-4bd1-9e2c-9a0c5d6d2d3a"
 *                       collection_id: 123
 *                       collection_title: "내 컬렉션"
 *       400:
 *         description: 쿼리 없음
 *       500:
 *         description: 서버 오류
 *
 * /api/selectings:
 *   get:
 *     tags:
 *       - Selectings
 *     summary: 내 셀렉팅 목록 조회
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: properties
 *         schema:
 *           type: string
 *           default: "*"
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 selectings:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: 인증 필요
 *       500:
 *         description: 서버 오류
 *   post:
 *     tags:
 *       - Selectings
 *     summary: 셀렉션 퍼오기
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - category_id
 *               - selecting_collection_id
 *               - selected_collection_id
 *               - selected_selection_id
 *             properties:
 *               category_id:
 *                 type: integer
 *               selecting_collection_id:
 *                 type: integer
 *                 description: 퍼올 내 컬렉션 ID
 *               selected_collection_id:
 *                 type: integer
 *                 description: 원본 컬렉션 ID
 *               selected_selection_id:
 *                 type: integer
 *                 description: 원본 셀렉션 ID
 *     responses:
 *       201:
 *         description: 생성됨
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       401:
 *         description: 인증 필요
 *       404:
 *         description: 원본 셀렉션 없음
 *       500:
 *         description: 서버 오류
 *
 * /api/users/ranking:
 *   get:
 *     tags:
 *       - Users
 *     summary: 랭킹 유저 목록
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 *       500:
 *         description: 서버 오류
 *
 * /api/users/search:
 *   get:
 *     tags:
 *       - Users
 *     summary: 유저 검색
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [users]
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/SearchUser"
 *             examples:
 *               ok:
 *                 value:
 *                   users:
 *                     - user_id: 45
 *                       user_name: "gimgahui"
 *                       description: "안녕하세요"
 *                       image_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *       400:
 *         description: 쿼리 없음
 *       500:
 *         description: 서버 오류
 *
 * /api/users/{userId}:
 *   get:
 *     tags:
 *       - Users
 *     summary: 다른 유저 정보 조회
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *       400:
 *         description: 잘못된 ID
 *       404:
 *         description: 유저 없음
 *       500:
 *         description: 서버 오류
 *
 * /api/users/{userId}/collections:
 *   get:
 *     tags:
 *       - Users
 *     summary: 특정 유저의 컬렉션 목록
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 collections:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: 잘못된 ID
 *       404:
 *         description: 유저 없음
 *       500:
 *         description: 서버 오류
 *
 * /api/users/me:
 *   get:
 *     tags:
 *       - Users
 *     summary: 내 정보 조회
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *       401:
 *         description: 인증 필요
 *       500:
 *         description: 서버 오류
 *   patch:
 *     tags:
 *       - Users
 *     summary: 내 정보 수정
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: 이름 없음
 *       401:
 *         description: 인증 필요
 *       500:
 *         description: 서버 오류
 *
 * /api/users/me/blocks:
 *   get:
 *     tags:
 *       - Users
 *     summary: 차단 유저 ID 목록 조회
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 blocked_user_ids:
 *                   type: array
 *                   items:
 *                     type: integer
 *       401:
 *         description: 인증 필요
 *       500:
 *         description: 서버 오류
 *   post:
 *     tags:
 *       - Users
 *     summary: 유저 차단
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - blocked_user_id
 *             properties:
 *               blocked_user_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: ID 없음
 *       401:
 *         description: 인증 필요
 *       500:
 *         description: 서버 오류
 *
 * /api/users/me/collections:
 *   get:
 *     tags:
 *       - Users
 *     summary: 내 컬렉션 목록 조회
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 collections:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: 인증 필요
 *       500:
 *         description: 서버 오류
 *
 * /api/users/me/likes:
 *   get:
 *     tags:
 *       - Users
 *     summary: 좋아요한 컬렉션 목록
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 collections:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: 인증 필요
 *       500:
 *         description: 서버 오류
 *
 * /api/keywords:
 *   post:
 *     tags:
 *       - Keywords
 *     summary: 키워드 추가
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - keywords
 *               - category_id
 *             properties:
 *               keywords:
 *                 type: array
 *                 items:
 *                   type: string
 *               category_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 keywords:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 필요
 *       500:
 *         description: 서버 오류
 *
 * /api/reports:
 *   post:
 *     tags:
 *       - Reports
 *     summary: 신고 제출
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - report_type
 *               - reported_post_id
 *               - report_reason
 *             properties:
 *               report_type:
 *                 type: integer
 *               reported_post_id:
 *                 type: object
 *                 description: "신고 대상 ID 맵 (예: {\"collection_id\": 1})"
 *               report_reason:
 *                 type: string
 *     responses:
 *       201:
 *         description: 생성됨
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 필요
 *       500:
 *         description: 서버 오류
 *
 * /api/membership:
 *   delete:
 *     tags:
 *       - Membership
 *     summary: 회원 탈퇴 (Soft delete)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       401:
 *         description: 인증 필요
 *       500:
 *         description: 서버 오류
 */
export {};
