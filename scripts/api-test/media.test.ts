import axios, { AxiosError, AxiosInstance } from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Automated API test for the EstateFlow CRM Media module.
 *
 * Verifies the full image lifecycle (upload -> attach -> list -> reorder -> delete)
 * plus upload validation (invalid MIME type, oversized file, unauthorized upload).
 *
 * The upload/attach/reorder/delete steps require a configured Cloudinary storage
 * provider (CLOUDINARY_* env vars). When Cloudinary is not configured the backend
 * rejects uploads with a 500 "not configured" error; this script detects that and
 * skips the storage-dependent checks (still running the validation checks, which
 * do not touch the provider) instead of reporting a false failure.
 *
 * Configure the target with the API_URL env var (default: http://localhost:3000).
 * The NestJS app is served under the versioned "/api/v1" prefix, appended here.
 */

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const BASE_URL = `${API_URL.replace(/\/+$/, '')}/api/v1`;

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const VALID_IMAGE_PATH = path.join(FIXTURES_DIR, 'valid.png');
const INVALID_FILE_PATH = path.join(FIXTURES_DIR, 'invalid.txt');

// A generated in-memory payload larger than the 10 MB per-file limit. Kept out of
// the fixtures folder so we don't commit a large binary blob to the repo.
const OVERSIZED_BYTES = 11 * 1024 * 1024;

const testUser = {
  name: 'Test Admin',
  // Strong password required by the hardened RegisterDto (upper/lower/number/special).
  email: 'security.admin@example.com',
  password: 'Password123!',
};

const testProperty = {
  title: 'Media Test Property',
  description: 'Property used to verify the media module',
  price: 5000000,
  location: 'Dhaka',
  bedrooms: 3,
  bathrooms: 2,
  area: 1500,
  propertyType: 'APARTMENT',
  status: 'AVAILABLE',
};

// Simple console helpers (matching api-test.ts style).
const pass = (msg: string): void => console.log(`\x1b[32m✓\x1b[0m ${msg}`);
const info = (msg: string): void => console.log(`\x1b[36m•\x1b[0m ${msg}`);
const warn = (msg: string): void => console.warn(`\x1b[33m! ${msg}\x1b[0m`);
const fail = (msg: string): void => console.error(`\x1b[31m✗ ${msg}\x1b[0m`);

/** Extracts a readable message from an axios/unknown error. */
function describeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axErr = error as AxiosError<{ message?: string; errors?: unknown[] }>;
    if (axErr.response) {
      const { status, data } = axErr.response;
      const detail = data?.message ?? axErr.message;
      const errors = data?.errors?.length ? ` | ${JSON.stringify(data.errors)}` : '';
      return `HTTP ${status} - ${detail}${errors}`;
    }
    if (axErr.request) {
      return `No response from ${BASE_URL} (is the server running?) - ${axErr.message}`;
    }
    return axErr.message;
  }
  return error instanceof Error ? error.message : String(error);
}

/** Asserts a condition, throwing a labelled error when it fails. */
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

interface MediaRecord {
  id: string;
  url: string;
  publicId: string;
  order: number;
  entityId: string | null;
}

type UploadEntry = { buffer: Buffer; filename: string; contentType: string };

/** Result of an upload attempt: either an HTTP response or a low-level network error. */
interface UploadOutcome {
  status: number;
  data: unknown;
  networkError: boolean;
  message: string;
}

/**
 * Posts a multipart/form-data upload to /media/upload. Uses buffers with an
 * explicit knownLength so the request has a reliable Content-Length. Returns a
 * normalized outcome instead of throwing, so callers can assert on both HTTP
 * responses and connection resets (which the server may trigger when it aborts
 * an oversized upload mid-stream).
 */
async function postUpload(
  client: AxiosInstance,
  files: UploadEntry[],
  authHeader?: Record<string, string>,
): Promise<UploadOutcome> {
  const form = new FormData();
  for (const file of files) {
    form.append('files', file.buffer, {
      filename: file.filename,
      contentType: file.contentType,
      knownLength: file.buffer.length,
    });
  }

  try {
    const res = await client.post('/media/upload', form, {
      headers: { ...(authHeader ?? {}), ...form.getHeaders() },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    const message =
      (res.data as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`;
    return { status: res.status, data: res.data, networkError: false, message };
  } catch (error) {
    // A socket reset while rejecting an oversized body is an acceptable rejection.
    return { status: 0, data: undefined, networkError: true, message: describeError(error) };
  }
}

async function run(): Promise<void> {
  info(`Target API: ${BASE_URL}`);

  // Sanity check the fixtures are present before we start.
  assert(fs.existsSync(VALID_IMAGE_PATH), `Missing fixture image: ${VALID_IMAGE_PATH}`);
  assert(fs.existsSync(INVALID_FILE_PATH), `Missing fixture file: ${INVALID_FILE_PATH}`);
  const validImage = fs.readFileSync(VALID_IMAGE_PATH);
  const invalidFile = fs.readFileSync(INVALID_FILE_PATH);

  const client: AxiosInstance = axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
    // Inspect non-2xx responses ourselves instead of throwing generically.
    validateStatus: () => true,
  });

  // --- Setup: authenticate and create a property to attach media to ---
  const registerRes = await client.post('/auth/register', testUser);
  if ([200, 201, 409].includes(registerRes.status)) {
    info('Authenticated user ready');
  } else if (registerRes.status === 429) {
    // Register is rate limited (3/min); the user very likely already exists.
    warn('Register rate limited (429) — assuming the user already exists and continuing');
  } else {
    throw new Error(
      `Register failed: HTTP ${registerRes.status} - ${JSON.stringify(registerRes.data)}`,
    );
  }

  const loginRes = await client.post('/auth/login', {
    email: testUser.email,
    password: testUser.password,
  });
  assert(
    loginRes.status === 200 || loginRes.status === 201,
    `Login failed: HTTP ${loginRes.status} - ${JSON.stringify(loginRes.data)}`,
  );
  const token: string | undefined = loginRes.data?.data?.accessToken ?? loginRes.data?.data?.token;
  assert(Boolean(token), 'Login response did not contain an access token');
  const authHeader = { Authorization: `Bearer ${token}` };

  const createPropertyRes = await client.post('/properties', testProperty, { headers: authHeader });
  assert(
    createPropertyRes.status === 201 || createPropertyRes.status === 200,
    `Create property failed: HTTP ${createPropertyRes.status} - ${JSON.stringify(createPropertyRes.data)}`,
  );
  const propertyId: string | undefined = createPropertyRes.data?.data?.id;
  assert(Boolean(propertyId), 'Create property response did not contain an id');
  info(`Property created for media tests: ${propertyId}`);

  // --- 1-5. Cloudinary-dependent lifecycle: upload -> attach -> list -> reorder -> delete ---
  let cloudinaryReady = true;

  // 1. Upload two images (two files so we can meaningfully verify reordering).
  const uploadOutcome = await postUpload(
    client,
    [
      { buffer: validImage, filename: 'valid.png', contentType: 'image/png' },
      { buffer: validImage, filename: 'valid-2.png', contentType: 'image/png' },
    ],
    authHeader,
  );

  const notConfigured =
    uploadOutcome.status === 500 && /cloudinary|not configured/i.test(uploadOutcome.message);

  if (notConfigured) {
    cloudinaryReady = false;
    warn(
      'Cloudinary is not configured (missing CLOUDINARY_* env vars) — skipping ' +
        'upload/attach/list/reorder/delete checks. Set the CLOUDINARY_* env vars to run them.',
    );
  } else {
    assert(
      uploadOutcome.status === 201,
      `Upload image failed: POST /media/upload -> HTTP ${uploadOutcome.status} - ${uploadOutcome.message}`,
    );
    const uploaded: MediaRecord[] = (uploadOutcome.data as { data?: MediaRecord[] })?.data ?? [];
    assert(Array.isArray(uploaded) && uploaded.length === 2, 'Upload did not return two media records');
    assert(
      uploaded.every((m) => typeof m.url === 'string' && m.url.length > 0),
      'Uploaded media is missing a url',
    );
    assert(
      uploaded.every((m) => typeof m.publicId === 'string' && m.publicId.length > 0),
      'Uploaded media is missing a publicId',
    );
    const [mediaOne, mediaTwo] = uploaded;
    pass('Image uploaded');

    // 2. Attach both images to the property.
    const attachRes = await client.post(
      `/properties/${propertyId}/media`,
      { mediaIds: [mediaOne.id, mediaTwo.id] },
      { headers: authHeader },
    );
    assert(
      attachRes.status === 200 || attachRes.status === 201,
      `Attach media failed: HTTP ${attachRes.status} - ${JSON.stringify(attachRes.data)}`,
    );
    const attached: MediaRecord[] = attachRes.data?.data ?? [];
    assert(
      attached.some((m) => m.id === mediaOne.id) && attached.some((m) => m.id === mediaTwo.id),
      'Attach response does not contain both uploaded media',
    );
    pass('Image attached');

    // 3. List the property's media and confirm the uploads are present.
    const listRes = await client.get(`/properties/${propertyId}/media`, { headers: authHeader });
    assert(listRes.status === 200, `Get property media failed: HTTP ${listRes.status}`);
    const listed: MediaRecord[] = listRes.data?.data ?? [];
    assert(Array.isArray(listed), 'Property media response is not an array');
    assert(
      listed.some((m) => m.id === mediaOne.id) && listed.some((m) => m.id === mediaTwo.id),
      'Uploaded media not found in property media list',
    );
    pass('Property media verified');

    // 4. Reorder the images (reverse) and verify the new order is returned.
    const reversedIds = [mediaTwo.id, mediaOne.id];
    const reorderRes = await client.patch(
      `/properties/${propertyId}/media/order`,
      { orderedIds: reversedIds },
      { headers: authHeader },
    );
    assert(reorderRes.status === 200, `Reorder media failed: HTTP ${reorderRes.status}`);
    const reordered: MediaRecord[] = reorderRes.data?.data ?? [];
    assert(reordered.length === 2, 'Reorder response did not return both media');
    assert(
      reordered[0].id === mediaTwo.id && reordered[1].id === mediaOne.id,
      'Reorder did not return media in the requested order',
    );
    assert(
      reordered[0].order === 0 && reordered[1].order === 1,
      'Reorder did not assign sequential order values',
    );
    pass('Media reorder verified');

    // 5. Delete both images and confirm they are gone from the database.
    for (const id of [mediaOne.id, mediaTwo.id]) {
      const deleteRes = await client.delete(`/media/${id}`, { headers: authHeader });
      assert(
        deleteRes.status === 200 || deleteRes.status === 204,
        `Delete media failed: DELETE /media/${id} -> HTTP ${deleteRes.status} - ${JSON.stringify(deleteRes.data)}`,
      );
    }
    const afterDeleteRes = await client.get(`/properties/${propertyId}/media`, {
      headers: authHeader,
    });
    const remaining: MediaRecord[] = afterDeleteRes.data?.data ?? [];
    assert(
      !remaining.some((m) => m.id === mediaOne.id || m.id === mediaTwo.id),
      'Deleted media still appears in the property media list',
    );
    pass('Media deleted');
  }

  // --- Validation checks (do not require Cloudinary) ---

  // Unauthorized upload: no Authorization header -> 401 (guard runs before the file interceptor).
  const unauthorized = await postUpload(client, [
    { buffer: validImage, filename: 'valid.png', contentType: 'image/png' },
  ]);
  assert(
    unauthorized.status === 401,
    `Unauthorized upload should return 401 but got HTTP ${unauthorized.status} - ${unauthorized.message}`,
  );

  // Invalid MIME type: a text/plain file is rejected by the Multer fileFilter -> 400.
  const invalidMime = await postUpload(
    client,
    [{ buffer: invalidFile, filename: 'invalid.txt', contentType: 'text/plain' }],
    authHeader,
  );
  assert(
    invalidMime.status === 400,
    `Invalid MIME upload should return 400 but got HTTP ${invalidMime.status} - ${invalidMime.message}`,
  );

  // File too large: an 11 MB payload exceeds the 10 MB limit -> 413 (or a socket reset).
  const oversized = await postUpload(
    client,
    [{ buffer: Buffer.alloc(OVERSIZED_BYTES, 1), filename: 'huge.png', contentType: 'image/png' }],
    authHeader,
  );
  assert(
    oversized.status === 413 || oversized.status === 400 || oversized.networkError,
    `Oversized upload should be rejected but got HTTP ${oversized.status} - ${oversized.message}`,
  );
  pass('Invalid file validation verified');

  // --- Cleanup: remove the property created for this run ---
  const cleanupRes = await client.delete(`/properties/${propertyId}`, { headers: authHeader });
  if (cleanupRes.status === 200 || cleanupRes.status === 204) {
    info('Cleaned up media test property');
  }

  console.log('');
  if (cloudinaryReady) {
    console.log('All API tests passed!');
  } else {
    warn(
      'Validation checks passed; storage-dependent media checks were skipped ' +
        '(Cloudinary not configured).',
    );
  }
}

run().catch((error: unknown) => {
  fail(describeError(error));
  process.exit(1);
});
