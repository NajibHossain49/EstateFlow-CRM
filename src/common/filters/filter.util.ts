/**
 * Reusable helpers for building dynamic Prisma `where` fragments. Each helper
 * returns `undefined` when its inputs are empty so callers can assign the result
 * directly and let Prisma skip the filter (an `undefined` field is ignored).
 */

/** Case-insensitive partial match, or `undefined` when no value was supplied. */
export function caseInsensitiveContains(
  value?: string,
): { contains: string; mode: 'insensitive' } | undefined {
  return value ? { contains: value, mode: 'insensitive' } : undefined;
}

/** Inclusive numeric range (`gte`/`lte`), or `undefined` when both bounds are absent. */
export function numericRange(
  min?: number,
  max?: number,
): { gte?: number; lte?: number } | undefined {
  if (min === undefined && max === undefined) {
    return undefined;
  }
  return {
    ...(min !== undefined ? { gte: min } : {}),
    ...(max !== undefined ? { lte: max } : {}),
  };
}

/** Inclusive date range (`gte`/`lte`), or `undefined` when both bounds are absent. */
export function dateRange(from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) {
    return undefined;
  }
  return {
    ...(from ? { gte: new Date(from) } : {}),
    ...(to ? { lte: new Date(to) } : {}),
  };
}

/**
 * Builds a Prisma `OR` array that matches a search term across several scalar
 * fields, or `undefined` when no term was supplied. The generic parameter lets
 * callers pin the exact Prisma `WhereInput` type at the call site.
 */
export function searchAcross<T>(fields: string[], term?: string): T[] | undefined {
  if (!term) {
    return undefined;
  }
  return fields.map((field) => ({ [field]: { contains: term, mode: 'insensitive' } }) as T);
}
