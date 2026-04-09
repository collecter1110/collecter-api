/**
 * @openapi
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     ErrorResponse:
 *       type: object
 *       required: [error]
 *       properties:
 *         error:
 *           type: string
 *       example:
 *         error: Failed to fetch ranking collections
 *
 *     RankingCollection:
 *       type: object
 *       required:
 *         - collection_id
 *         - collection_name
 *       properties:
 *         collection_id: { type: integer, example: 123 }
 *         collection_name: { type: string, example: My collection }
 *         image_id: { type: string, nullable: true, example: "b7c6f3b0-6a0f-4b4a-9a90-2c02e4a2b9a1" }
 *
 *     RankingSelection:
 *       type: object
 *       required:
 *         - selection_id
 *         - selection_name
 *         - keywords
 *       properties:
 *         selection_id: { type: integer, example: 456 }
 *         selection_name: { type: string, example: My selection }
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
