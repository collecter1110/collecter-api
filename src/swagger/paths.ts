/**
 * @openapi
 * /auth/check-username:
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
 * /auth/delete:
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
 * /auth/login:
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
 * /auth/logout:
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
 * /auth/otp/send:
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
 * /auth/otp/verify:
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
 * /auth/refresh:
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
 *       401:
 *         description: 토큰 누락·만료·변조, 또는 세션 폐기/만료 (재발급 불가)
 *
 * /collections/ranking:
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
 * /collections/search:
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
 * /collections/{collectionId}:
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
 * /collections/{collectionId}/like:
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
 * /collections/{collectionId}/selections:
 *   get:
 *     tags:
 *       - Selections
 *     summary: 컬렉션의 셀렉션 목록 조회
 *     description: |
 *       컬렉션에 속한 셀렉션 목록을 반환합니다.
 *       - public 컬렉션: 토큰 없이 조회 가능
 *       - private 컬렉션: 소유자만 조회 가능 (Authorization 필요)
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: header
 *         name: Authorization
 *         required: false
 *         schema:
 *           type: string
 *         description: Bearer access token (optional)
 *         example: Bearer eyJhbGciOi...
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
 *                     $ref: "#/components/schemas/SelectionListItem"
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
 * /selections/{id}:
 *   get:
 *     tags:
 *       - Selections
 *     summary: 셀렉션 상세 조회
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: collection_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 조회 컨텍스트의 컬렉션 ID (비공개 체크용)
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 selection:
 *                   $ref: "#/components/schemas/SelectionDetail"
 *       400:
 *         description: 잘못된 요청 (id 또는 collection_id 누락/형식 오류)
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
 *         name: id
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
 *                 description: |
 *                   유지할 기존 image_id JSON 배열. 빈 배열이면 전체 삭제.
 *                   **배열 순서가 곧 이미지 순서**이며, 이 순서대로 `sort_order`가 0부터 다시 부여된다.
 *                   새로 업로드한 `images`는 그 뒤에 파일 순서대로 이어 붙는다.
 *                   생략하면 기존 이미지의 순서를 그대로 두고 새 이미지만 맨 뒤에 추가한다.
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: 수정 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [errorCode, msg, data]
 *               properties:
 *                 errorCode:
 *                   type: string
 *                   example: SU000
 *                 msg:
 *                   type: string
 *                   example: ok
 *                 data:
 *                   type: object
 *                   required: [success]
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     success: true
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               invalidId:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Invalid ID
 *                   data: {}
 *               keywordsRequired:
 *                 value:
 *                   errorCode: SU000
 *                   msg: keywords is required
 *                   data: {}
 *               keywordsInvalid:
 *                 value:
 *                   errorCode: SU000
 *                   msg: keywords must be a non-empty JSON array of strings
 *                   data: {}
 *       401:
 *         description: 인증 필요
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *       404:
 *         description: 셀렉션 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               notFound:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Selection not found
 *                   data: {}
 *       403:
 *         description: 권한 없음 (소유자만 수정 가능)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               forbidden:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Only the owner can edit this selection
 *                   data: {}
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               updateFailed:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to update selection
 *                   data: {}
 *               keywordSaveFailed:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to save keywords
 *                   data: {}
 *   delete:
 *     tags:
 *       - Selections
 *     summary: 셀렉션 삭제 (소유자만)
 *     description: 소유자인 경우 셀렉션 자체를 삭제합니다.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 삭제 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [errorCode, msg, data]
 *               properties:
 *                 errorCode:
 *                   type: string
 *                   example: SU000
 *                 msg:
 *                   type: string
 *                   example: ok
 *                 data:
 *                   type: object
 *                   required: [success]
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     success: true
 *       400:
 *         description: 잘못된 ID
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               invalidId:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Invalid ID
 *                   data: {}
 *       401:
 *         description: 인증 필요
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *       404:
 *         description: 셀렉션 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               notFound:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Selection not found
 *                   data: {}
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               deleteFailed:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to delete selection
 *                   data: {}
 *               removeMappingFailed:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to remove selection from collection
 *                   data: {}
 *
 * /selections/{id}/move:
 *   patch:
 *     tags:
 *       - Selections
 *     summary: 셀렉션 다른 컬렉션으로 이동
 *     description: collection_selections 매핑을 변경하여 셀렉션을 다른 컬렉션으로 이동합니다.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               - source_collection_id
 *               - target_collection_id
 *             properties:
 *               source_collection_id:
 *                 type: integer
 *                 description: 현재 컬렉션 ID
 *               target_collection_id:
 *                 type: integer
 *                 description: 이동할 대상 컬렉션 ID
 *     responses:
 *       200:
 *         description: 이동 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [errorCode, msg, data]
 *               properties:
 *                 errorCode:
 *                   type: string
 *                   example: SU000
 *                 msg:
 *                   type: string
 *                   example: ok
 *                 data:
 *                   type: object
 *                   required: [success]
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     success: true
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               invalidId:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Invalid ID
 *                   data: {}
 *               missingBody:
 *                 value:
 *                   errorCode: SU000
 *                   msg: source_collection_id and target_collection_id are required
 *                   data: {}
 *       401:
 *         description: 인증 필요
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *       404:
 *         description: 매핑 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               notFound:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Selection not found in source collection
 *                   data: {}
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to move selection
 *                   data: {}
 *
 * /selections/ranking:
 *   get:
 *     tags:
 *       - Selections
 *     summary: Get ranking selections
 *     description: |
 *       public 컬렉션에 매핑된 셀렉션을 category_id별 상위 3개씩 반환합니다.
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
 * /selections/search:
 *   get:
 *     tags:
 *       - Selections
 *     summary: 셀렉션 검색
 *     description: |
 *       키워드명으로 셀렉션을 검색합니다.
 *       public 컬렉션에 매핑된 셀렉션만 검색됩니다.
 *       Authorization 헤더가 있으면 본인 셀렉션과 차단한 유저의 셀렉션을 제외합니다.
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: Authorization
 *         required: false
 *         schema:
 *           type: string
 *         description: Bearer access token (optional)
 *         example: Bearer eyJhbGciOi...
 *     responses:
 *       200:
 *         description: 검색 결과 셀렉션 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [errorCode, msg, data]
 *               properties:
 *                 errorCode:
 *                   type: string
 *                   example: SU000
 *                 msg:
 *                   type: string
 *                   example: ok
 *                 data:
 *                   type: object
 *                   required: [selections]
 *                   properties:
 *                     selections:
 *                       type: array
 *                       items:
 *                         $ref: "#/components/schemas/SearchSelection"
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     selections:
 *                       - id: 456
 *                         selection_title: "내 셀렉션"
 *                         image_id: "7c2c8fb0-4d1b-4bd1-9e2c-9a0c5d6d2d3a"
 *                         collection_id: 123
 *                         collection_title: "내 컬렉션"
 *               empty:
 *                 summary: 검색 결과 없음
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     selections: []
 *       400:
 *         description: 쿼리 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: "Query parameter 'q' is required"
 *                   data: {}
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to search selections
 *                   data: {}
 *
 * /selectings:
 *   get:
 *     tags:
 *       - Selectings
 *     summary: 내가 셀렉팅한 목록 조회
 *     description: |
 *       `collection_selections` 테이블에서 내가 다른 유저의 셀렉션을 퍼온(selecting) 목록을 조회합니다.
 *       내가 추가했지만 내가 owner가 아닌 셀렉션만 반환합니다.
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
 *                 selectings:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       created_at: { type: string, format: date-time, example: "2026-04-15T07:31:27.000Z" }
 *                       selection_name: { type: string, example: "일인칭 단수" }
 *                       user_name: { type: string, example: "iris3455" }
 *                       image_id: { type: string, nullable: true }
 *                       owner_name: { type: string, example: "siriya" }
 *                       owner_id: { type: integer, example: 69 }
 *                       collection_id: { type: integer, example: 636 }
 *                       id: { type: integer, example: 789 }
 *       401:
 *         description: 인증 필요
 *       500:
 *         description: 서버 오류
 *   post:
 *     tags:
 *       - Selectings
 *     summary: 셀렉션 퍼오기 (selecting)
 *     description: |
 *       다른 유저의 셀렉션을 내 컬렉션에 매핑합니다.
 *       셀렉션 데이터를 복사하지 않고 collection_selections에 매핑만 추가합니다.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - selecting_collection_id
 *               - selected_selection_id
 *             properties:
 *               selecting_collection_id:
 *                 type: integer
 *                 description: 퍼올 내 컬렉션 ID
 *               selected_selection_id:
 *                 type: integer
 *                 description: 원본 셀렉션 ID
 *     responses:
 *       201:
 *         description: 셀렉팅 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [errorCode, msg, data]
 *               properties:
 *                 errorCode:
 *                   type: string
 *                   example: SU000
 *                 msg:
 *                   type: string
 *                   example: ok
 *                 data:
 *                   type: object
 *                   required: [success]
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *             examples:
 *               ok:
 *                 value:
 *                   errorCode: SU000
 *                   msg: ok
 *                   data:
 *                     success: true
 *       400:
 *         description: 잘못된 요청 (본인 셀렉션 퍼오기 불가 등)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               ownSelection:
 *                 value:
 *                   errorCode: SU000
 *                   msg: You cannot select your own selection
 *                   data: {}
 *       401:
 *         description: 인증 필요
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *       404:
 *         description: 원본 셀렉션 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               notFound:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Source selection not found
 *                   data: {}
 *       403:
 *         description: 퍼가기 불가 셀렉션
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               notSelectable:
 *                 value:
 *                   errorCode: SU000
 *                   msg: This selection is not selectable
 *                   data: {}
 *       409:
 *         description: 이미 셀렉팅된 셀렉션
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               conflict:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Already selected in this collection
 *                   data: {}
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *             examples:
 *               error:
 *                 value:
 *                   errorCode: SU000
 *                   msg: Failed to create selecting
 *                   data: {}
 *
 * /selected:
 *   get:
 *     tags:
 *       - Selectings
 *     summary: 셀렉팅 당한 목록 조회
 *     description: |
 *       `collection_selections` 테이블에서 다른 유저가 내 셀렉션을 퍼간(selected) 목록을 조회합니다.
 *       내가 owner인 셀렉션 중 다른 유저가 추가한 매핑을 조회합니다.
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
 *                 selected:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       created_at: { type: string, format: date-time, example: "2026-04-15T07:31:27.000Z" }
 *                       selection_name: { type: string, example: "일인칭 단수" }
 *                       user_name: { type: string, example: "iris3455" }
 *                       image_id: { type: string, nullable: true }
 *                       owner_name: { type: string, example: "siriya" }
 *                       owner_id: { type: integer, example: 69 }
 *                       collection_id: { type: integer, example: 636 }
 *                       id: { type: integer, example: 789 }
 *       401:
 *         description: 인증 필요
 *       500:
 *         description: 서버 오류
 *
 * /users/search:
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
 * /users/me:
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
 *                   $ref: "#/components/schemas/MyUserInfo"
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
 *               - user_name
 *             properties:
 *               user_name:
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
 * /users/me/blocks:
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
 * /users/me/collections:
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
 * /users/me/likes:
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
 * /reports:
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
 * /membership:
 *   delete:
 *     tags:
 *       - Membership
 *     summary: 회원 탈퇴 (Soft delete)
 *     deprecated: true
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
 * /user/detail:
 *   get:
 *     tags:
 *       - Users
 *     summary: 유저 상세 조회 (프로필 + 컬렉션 요약)
 *     parameters:
 *       - in: query
 *         name: user_id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 45
 *       - in: header
 *         name: Authorization
 *         required: false
 *         schema:
 *           type: string
 *         description: Bearer access token (optional)
 *         example: Bearer eyJhbGciOi...
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/UserDetailResponse"
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *       404:
 *         description: 유저 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 */
export {};
