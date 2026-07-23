export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Value returned by paginated service methods. The response interceptor detects
 * this shape and hoists `meta` to the top level of the envelope.
 */
export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

/** Number of rows to skip for the given 1-based page. */
export function getSkip(page: number, limit: number): number {
  return (page - 1) * limit;
}

/** Builds the standard pagination metadata block returned by every list endpoint. */
export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

/** Type guard used by the response interceptor to recognise a paginated result. */
export function isPaginatedResult(value: unknown): value is PaginatedResult<unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as { items?: unknown; meta?: unknown };
  const meta = candidate.meta as Partial<PaginationMeta> | undefined;
  return (
    Array.isArray(candidate.items) &&
    !!meta &&
    typeof meta === 'object' &&
    typeof meta.page === 'number' &&
    typeof meta.limit === 'number' &&
    typeof meta.total === 'number'
  );
}
