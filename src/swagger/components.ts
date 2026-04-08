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
 *         file_path: { type: string, nullable: true, example: "https://cdn.example.com/collections/cover.jpg" }
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
 *         file_path: { type: string, nullable: true, example: "https://cdn.example.com/selections/img1.jpg" }
 *         keywords:
 *           type: array
 *           items:
 *             type: object
 *             required: [keyword_id, keyword_name]
 *             properties:
 *               keyword_id: { type: integer, example: 7 }
 *               keyword_name: { type: string, example: "키워드" }
 */
export {};
