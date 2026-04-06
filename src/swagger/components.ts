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
 *         - id
 *         - user_id
 *         - title
 *         - created_at
 *         - image_file_path
 *         - tags
 *         - user_name
 *         - primary_keywords
 *         - selection_num
 *         - like_num
 *         - is_public
 *         - category_id
 *       properties:
 *         id: { type: integer, example: 123 }
 *         user_id: { type: integer, example: 45 }
 *         title: { type: string, example: My collection }
 *         description: { type: string, nullable: true, example: null }
 *         created_at: { type: string, format: date-time, example: "2026-04-06T12:34:56.000Z" }
 *         image_file_path: { type: string, example: "https://cdn.example.com/collections/cover.jpg" }
 *         image_id: { type: string, format: uuid, nullable: true, example: "b7c6f3b0-6a0f-4b4a-9a90-2c02e4a2b9a1" }
 *         tags:
 *           type: array
 *           items: { type: string }
 *           example: ["tag1", "tag2"]
 *         user_name: { type: string, example: gimgahui }
 *         primary_keywords:
 *           type: array
 *           items:
 *             type: object
 *             required: [keyword_id, keyword_name]
 *             properties:
 *               keyword_id: { type: integer, example: 7 }
 *               keyword_name: { type: string, example: "키워드" }
 *         selection_num: { type: integer, example: 12 }
 *         like_num: { type: integer, example: 34 }
 *         is_public: { type: boolean, example: true }
 *         category_id: { type: integer, example: 1 }
 *
 *     RankingSelectionImage:
 *       type: object
 *       required: [image_id, sort_order, images]
 *       properties:
 *         image_id: { type: string, format: uuid, example: "7c2c8fb0-4d1b-4bd1-9e2c-9a0c5d6d2d3a" }
 *         sort_order: { type: integer, example: 0 }
 *         images:
 *           type: array
 *           items:
 *             type: object
 *             required: [file_path]
 *             properties:
 *               file_path: { type: string, example: "https://cdn.example.com/selections/img1.jpg" }
 *
 *     RankingSelection:
 *       type: object
 *       required:
 *         - collection_id
 *         - selection_id
 *         - title
 *         - created_at
 *         - is_ordered
 *         - is_selectable
 *         - is_selecting
 *         - select_num
 *         - category_id
 *         - selection_images
 *         - thumb_file_path
 *       properties:
 *         collection_id: { type: integer, example: 123 }
 *         selection_id: { type: integer, example: 456 }
 *         title: { type: string, example: My selection }
 *         description: { type: string, nullable: true, example: null }
 *         user_id: { type: integer, nullable: true, example: 45 }
 *         owner_id: { type: integer, nullable: true, example: 45 }
 *         owner_name: { type: string, nullable: true, example: "gimgahui" }
 *         is_ordered: { type: boolean, example: false }
 *         link: { type: string, nullable: true, example: null }
 *         items: { type: array, nullable: true, items: {}, example: [] }
 *         keywords:
 *           type: array
 *           items:
 *             type: object
 *             required: [keyword_id, keyword_name]
 *             properties:
 *               keyword_id: { type: integer, example: 7 }
 *               keyword_name: { type: string, example: "키워드" }
 *         created_at: { type: string, format: date-time, example: "2026-04-06T12:34:56.000Z" }
 *         is_selectable: { type: boolean, example: true }
 *         is_selecting: { type: boolean, example: false }
 *         select_num: { type: integer, example: 99 }
 *         category_id: { type: integer, example: 1 }
 *         selection_images:
 *           type: array
 *           items:
 *             $ref: "#/components/schemas/RankingSelectionImage"
 *         thumb_file_path:
 *           type: string
 *           nullable: true
 *           example: "https://cdn.example.com/selections/thumb.jpg"
 */
export {};
