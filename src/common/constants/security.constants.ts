/** Rate-limit window in milliseconds (1 minute). */
export const THROTTLE_TTL_MS = 60_000;

/** Default per-window limit for authenticated/general APIs. */
export const THROTTLE_DEFAULT_LIMIT = 100;

/** Per-window limit for the login endpoint (brute-force protection). */
export const THROTTLE_LOGIN_LIMIT = 5;

/** Per-window limit for the register endpoint (abuse protection). */
export const THROTTLE_REGISTER_LIMIT = 3;

/** Maximum accepted JSON request body size. */
export const JSON_BODY_LIMIT = '2mb';
