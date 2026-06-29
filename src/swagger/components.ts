/**
 * @openapi
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     ApiResponse:
 *       type: object
 *       required: [errorCode, msg, data]
 *       properties:
 *         errorCode:
 *           type: string
 *           example: SU000
 *         msg:
 *           type: string
 *           example: ok
 *         data:
 *           type: object
 *     ErrorResponse:
 *       type: object
 *       required: [errorCode, msg, data]
 *       properties:
 *         errorCode:
 *           type: string
 *           example: SU000
 *         msg:
 *           type: string
 *         data:
 *           type: object
 *       example:
 *         errorCode: SU000
 *         msg: Failed to fetch ranking collections
 *         data: {}
 *
 *     MyUserInfo:
 *       type: object
 *       required: [user_id, user_name, email]
 *       properties:
 *         user_id: { type: integer, example: 45 }
 *         user_name: { type: string, example: "gimgahui" }
 *         email: { type: string, format: email, example: "user@example.com" }
 *         description: { type: string, nullable: true, example: "안녕하세요" }
 *         image_id: { type: string, nullable: true, example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }
 *
 *     UserDetailCollection:
 *       type: object
 *       required: [collection_id, collection_title, image_id, selection_num]
 *       properties:
 *         collection_id: { type: integer, example: 123 }
 *         collection_title: { type: string, example: "내 컬렉션" }
 *         image_id: { type: string, nullable: true, example: "b7c6f3b0-6a0f-4b4a-9a90-2c02e4a2b9a1" }
 *         selection_num: { type: integer, example: 12 }
 *
 *     UserDetailResponse:
 *       type: object
 *       required: [user_id, user_name, image_id, description, collections]
 *       properties:
 *         user_id: { type: integer, example: 45 }
 *         user_name: { type: string, example: "gimgahui" }
 *         image_id: { type: string, nullable: true, example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }
 *         description: { type: string, nullable: true, example: "안녕하세요" }
 *         collections:
 *           type: array
 *           items:
 *             $ref: "#/components/schemas/UserDetailCollection"
 *
 *     RankingCollection:
 *       type: object
 *       required:
 *         - collection_id
 *         - collection_title
 *         - selection_num
 *         - user_id
 *         - has_liked
 *       properties:
 *         collection_id: { type: integer, example: 123 }
 *         collection_title: { type: string, example: My collection }
 *         image_id: { type: string, nullable: true, example: "b7c6f3b0-6a0f-4b4a-9a90-2c02e4a2b9a1" }
 *         selection_num: { type: integer, example: 5 }
 *         user_id: { type: integer, example: 45 }
 *         user_name: { type: string, nullable: true, example: gimgahui, description: "작성자 이름" }
 *         user_image_id: { type: string, nullable: true, example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", description: "작성자 프로필 이미지 (userinfo.image_id)" }
 *         has_liked: { type: boolean, example: false, description: "로그인 유저가 이 컬렉션을 좋아요했는지 여부 (토큰 없으면 항상 false)" }
 *
 *     KeywordEntry:
 *       type: object
 *       required: [keyword_id, keyword_name]
 *       properties:
 *         keyword_id: { type: integer, example: 7 }
 *         keyword_name: { type: string, example: "키워드" }
 *
 *     SelectionImage:
 *       type: object
 *       required: [image_id, sort_order]
 *       properties:
 *         image_id: { type: string, example: "7c2c8fb0-4d1b-4bd1-9e2c-9a0c5d6d2d3a" }
 *         sort_order: { type: integer, example: 0 }
 *
 *     SelectionListItem:
 *       type: object
 *       required:
 *         - id
 *         - category_id
 *         - collection_id
 *         - selection_title
 *         - owner_id
 *         - owner_name
 *         - keywords
 *         - image_id
 *       properties:
 *         id: { type: integer, example: 456 }
 *         category_id: { type: integer, example: 1 }
 *         collection_id: { type: integer, example: 123 }
 *         selection_title: { type: string, example: "내 셀렉션" }
 *         owner_id: { type: integer, example: 45 }
 *         owner_name: { type: string, example: "gimgahui" }
 *         owner_image_id: { type: string, nullable: true, example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", description: "작성자 프로필 이미지 (userinfo.image_id)" }
 *         keywords:
 *           type: array
 *           items:
 *             $ref: "#/components/schemas/KeywordEntry"
 *         image_id: { type: string, nullable: true, example: "7c2c8fb0-4d1b-4bd1-9e2c-9a0c5d6d2d3a" }
 *
 *     SelectionDetail:
 *       type: object
 *       required:
 *         - id
 *         - category_id
 *         - owner_id
 *         - selection_title
 *         - description
 *         - is_ordered
 *         - link
 *         - items
 *         - keywords
 *         - created_at
 *         - owner_name
 *         - is_selectable
 *         - selection_images
 *       properties:
 *         id: { type: integer, example: 789 }
 *         category_id: { type: integer, example: 1 }
 *         collection_id: { type: integer, nullable: true, example: 123 }
 *         owner_id: { type: integer, example: 45 }
 *         selection_title: { type: string, example: "내 셀렉션" }
 *         description: { type: string, nullable: true, example: "셀렉션 설명" }
 *         is_ordered: { type: boolean, example: false }
 *         link: { type: string, nullable: true, example: null }
 *         items: { type: array, nullable: true, items: { type: object }, example: null }
 *         keywords:
 *           type: array
 *           items:
 *             $ref: "#/components/schemas/KeywordEntry"
 *         created_at: { type: string, format: date-time, example: "2026-04-06T12:34:56.000Z" }
 *         owner_name: { type: string, example: "gimgahui" }
 *         user_id: { type: integer, example: 45, description: "작성자(owner) 유저 ID (owner_id와 동일)" }
 *         user_image_id: { type: string, nullable: true, example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", description: "작성자 프로필 이미지 (userinfo.image_id)" }
 *         is_selectable: { type: boolean, example: true }
 *         has_selecting: { type: boolean, example: false, description: "로그인 유저가 이 셀렉션을 셀렉팅했는지 여부" }
 *         selection_images:
 *           type: array
 *           items:
 *             $ref: "#/components/schemas/SelectionImage"
 *
 *     RankingSelection:
 *       type: object
 *       required:
 *         - id
 *         - collection_id
 *         - selection_title
 *         - keywords
 *       properties:
 *         id: { type: integer, example: 456 }
 *         collection_id: { type: integer, example: 123 }
 *         selection_title: { type: string, example: My selection }
 *         image_id: { type: string, nullable: true, example: "7c2c8fb0-4d1b-4bd1-9e2c-9a0c5d6d2d3a" }
 *         keywords:
 *           type: array
 *           items:
 *             $ref: "#/components/schemas/KeywordEntry"
 *
 *     SearchCollection:
 *       type: object
 *       required:
 *         - collection_id
 *         - collection_title
 *       properties:
 *         collection_id: { type: integer, example: 123 }
 *         collection_title: { type: string, example: "내 컬렉션" }
 *         image_id: { type: string, nullable: true, example: "b7c6f3b0-6a0f-4b4a-9a90-2c02e4a2b9a1" }
 *
 *     SearchSelection:
 *       type: object
 *       required:
 *         - id
 *         - selection_title
 *         - collection_id
 *         - collection_title
 *       properties:
 *         id: { type: integer, example: 456 }
 *         selection_title: { type: string, example: "내 셀렉션" }
 *         image_id: { type: string, nullable: true, example: "7c2c8fb0-4d1b-4bd1-9e2c-9a0c5d6d2d3a" }
 *         collection_id: { type: integer, example: 123 }
 *         collection_title: { type: string, example: "내 컬렉션" }
 *
 *     SearchUser:
 *       type: object
 *       required:
 *         - user_id
 *         - user_name
 *       properties:
 *         user_id: { type: integer, example: 45 }
 *         user_name: { type: string, example: "gimgahui" }
 *         description: { type: string, nullable: true, example: "안녕하세요" }
 *         image_id: { type: string, nullable: true, example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }
 */
export {};
