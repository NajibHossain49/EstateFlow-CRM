/** Default success message used by the response interceptor when none is set. */
export const DEFAULT_RESPONSE_MESSAGE = 'Request successful';

/** Global route prefix applied in bootstrap. */
export const API_GLOBAL_PREFIX = 'api';

/**
 * Default (and currently only) API version. URI versioning serves routes under
 * `/{API_GLOBAL_PREFIX}/v{API_VERSION}` (e.g. `/api/v1/properties`). New versions
 * are added by tagging controllers/handlers with `@Version('2')` without breaking
 * existing v1 clients.
 */
export const API_VERSION = '1';

/** Swagger UI mount path (relative to the global prefix). */
export const SWAGGER_PATH = 'docs';
