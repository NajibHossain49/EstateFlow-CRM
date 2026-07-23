import { SortOrder } from './sort-query.dto';

/**
 * Builds a Prisma `orderBy` object from a validated field and direction.
 * `sortBy` must already be constrained to a known column (via `@IsIn`), which
 * keeps sorting safe from injection.
 */
export function buildOrderBy<TField extends string>(
  sortBy: TField,
  sortOrder: SortOrder,
): Record<TField, SortOrder> {
  return { [sortBy]: sortOrder } as Record<TField, SortOrder>;
}
