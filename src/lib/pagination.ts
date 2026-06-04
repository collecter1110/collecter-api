// 쿼리 파라미터 page/size 파싱 헬퍼
// - page: 1부터 시작 (기본 1)
// - size: 페이지당 항목 수 (기본 10)
export type Pagination = { page: number; size: number; offset: number };

export type PaginationResult =
  | { ok: true; value: Pagination }
  | { ok: false; error: string };

export function parsePagination(
  searchParams: URLSearchParams,
  defaultSize = 10
): PaginationResult {
  const pageParam = searchParams.get("page");
  const sizeParam = searchParams.get("size");

  const page = pageParam !== null ? parseInt(pageParam, 10) : 1;
  const size = sizeParam !== null ? parseInt(sizeParam, 10) : defaultSize;

  if (pageParam !== null && (isNaN(page) || page < 1)) {
    return { ok: false, error: "page must be a positive integer" };
  }
  if (sizeParam !== null && (isNaN(size) || size < 1)) {
    return { ok: false, error: "size must be a positive integer" };
  }

  return { ok: true, value: { page, size, offset: (page - 1) * size } };
}
