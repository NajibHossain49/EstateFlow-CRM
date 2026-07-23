import { PaginationMeta } from '../pagination/pagination.util';

/**
 * Standard success envelope returned by every endpoint. `meta` carries
 * pagination metadata for list endpoints and is `null` otherwise.
 */
export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
  meta: PaginationMeta | null;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  errors: unknown[];
}
