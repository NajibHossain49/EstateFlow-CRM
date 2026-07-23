const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Returns true when the value is a well-formed v4 UUID string. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4_REGEX.test(value);
}

/** Trims a string and returns `undefined` when the result is empty. */
export function toOptionalTrimmed(value?: string): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
