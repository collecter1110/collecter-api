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
 *       required: [user_id, user_name, email, selecting_count, selected_count, like_count]
 *       properties:
 *         user_id: { type: integer, example: 45 }
 *         user_name: { type: string, example: "gimgahui" }
 *         email: { type: string, format: email, example: "user@example.com" }
 *         description: { type: string, nullable: true, example: "안녕하세요" }
 *         image_id: { type: string, nullable: true, example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }
 *         selecting_count: { type: integer, example: 12 }
 *         selected_count: { type: integer, example: 5 }
 *         like_count: { type: integer, example: 30 }
 *
 *     UserDetailCollection:
 *       type: object
 *       required: [collection_id, collection_title, image_id]
 *       properties:
 *         collection_id: { type: integer, example: 123 }
 *         collection_title: { type: string, example: "내 컬렉션" }
 *         image_id: { type: string, nullable: true, example: "b7c6f3b0-6a0f-4b4a-9a90-2c02e4a2b9a1" }
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
 *       properties:
 *         collection_id: { type: integer, example: 123 }
 *         collection_title: { type: string, example: My collection }
 *         image_id: { type: string, nullable: true, example: "b7c6f3b0-6a0f-4b4a-9a90-2c02e4a2b9a1" }
 *
 *     RankingSelection:
 *       type: object
 *       required:
 *         - selection_id
 *         - selection_title
 *         - keywords
 *       properties:
 *         selection_id: { type: integer, example: 456 }
 *         selection_title: { type: string, example: My selection }
 *         image_id: { type: string, nullable: true, example: "7c2c8fb0-4d1b-4bd1-9e2c-9a0c5d6d2d3a" }
 *         keywords:
 *           type: array
 *           items:
 *             type: object
 *             required: [keyword_id, keyword_name]
 *             properties:
 *               keyword_id: { type: integer, example: 7 }
 *               keyword_name: { type: string, example: "키워드" }
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
 *         - selection_id
 *         - selection_title
 *         - collection_id
 *         - collection_title
 *       properties:
 *         selection_id: { type: integer, example: 456 }
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
