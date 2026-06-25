/** Sayfalı liste yanıtları için tip güvenli sarmalayıcı. */
export interface PaginatedResult<T> {
  items: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    pageCount: number;
  };
}

export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  return {
    items,
    meta: {
      total,
      page,
      limit,
      pageCount: Math.ceil(total / limit) || 1,
    },
  };
}
