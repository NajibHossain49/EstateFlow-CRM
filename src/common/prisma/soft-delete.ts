import { Prisma } from '@prisma/client';

/**
 * Models that participate in soft delete. Reads against these models are
 * automatically scoped to `deletedAt: null` by the Prisma middleware unless the
 * caller explicitly opts in to include deleted rows.
 */
export const SOFT_DELETE_MODELS: ReadonlySet<Prisma.ModelName> = new Set([
  Prisma.ModelName.Property,
  Prisma.ModelName.Client,
  Prisma.ModelName.Lead,
  Prisma.ModelName.Visit,
  Prisma.ModelName.Activity,
  Prisma.ModelName.Media,
]);

/**
 * Out-of-band marker placed on query args to tell the soft-delete middleware to
 * skip the automatic `deletedAt: null` filter (used for admin "include deleted"
 * queries and for restore lookups). The middleware strips it before the query
 * reaches the Prisma engine, so it never leaks into a real query.
 */
export const INCLUDE_DELETED_ARG = '__includeDeleted';

/**
 * Tags a Prisma query-args object so the middleware returns soft-deleted rows
 * too. Returns the same object (typed unchanged) so it can be passed straight
 * into a Prisma call without widening its type.
 */
export function withDeleted<T extends object>(args: T, includeDeleted?: boolean): T {
  if (includeDeleted) {
    (args as Record<string, unknown>)[INCLUDE_DELETED_ARG] = true;
  }
  return args;
}
