import axios, { AxiosError, AxiosInstance, AxiosResponse } from 'axios';
import * as path from 'path';

/**
 * Automated API smoke test for the EstateFlow CRM backend.
 *
 * Runs the full happy-path flow (register -> login -> properties -> clients -> leads ->
 * visits -> activity timeline -> dashboard analytics) against a running instance and exits
 * non-zero if any step fails.
 *
 * Configure the target with the API_URL env var (default: http://localhost:3000).
 * The NestJS app is served under the global "/api" prefix, which is appended here.
 */

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const BASE_URL = `${API_URL.replace(/\/+$/, '')}/api`;

const testUser = {
  name: 'Test Admin',
  // Strong password required by the hardened RegisterDto (upper/lower/number/special).
  email: 'security.admin@example.com',
  password: 'Password123!',
};

const testProperty = {
  title: 'Modern Apartment',
  description: 'Test property',
  price: 5000000,
  location: 'Dhaka',
  bedrooms: 3,
  bathrooms: 2,
  area: 1500,
  propertyType: 'APARTMENT',
  status: 'AVAILABLE',
};

const testClient = {
  name: 'Test Client',
  phone: '01700000000',
  email: 'client@example.com',
  budget: 8000000,
  preferredLocation: 'Gulshan',
};

const testLead = {
  name: 'Test Lead Customer',
  phone: '01800000000',
  email: 'lead@example.com',
  source: 'FACEBOOK',
  status: 'NEW',
  notes: 'Interested in apartment',
};

// Visit reuses the created clientId/propertyId, so only the static fields live here.
const testVisit = {
  visitDate: '2026-07-25T10:00:00.000Z',
  notes: 'Customer wants to see the apartment',
};

// Simple console helpers
const pass = (msg: string): void => console.log(`\x1b[32m✓\x1b[0m ${msg}`);
const info = (msg: string): void => console.log(`\x1b[36m•\x1b[0m ${msg}`);
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

interface ListMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

type ListItem = Record<string, unknown>;

/**
 * Validates the shared paginated list envelope and returns the parsed items/meta.
 * Checks: HTTP 200, a `data` array, a top-level `meta` object containing every
 * pagination key, and that totalPages / hasNextPage / hasPreviousPage are
 * internally consistent with page, limit and total.
 */
function assertPaginated(
  label: string,
  endpoint: string,
  res: AxiosResponse,
): { items: ListItem[]; meta: ListMeta } {
  assert(
    res.status === 200,
    `${label} failed: GET ${endpoint} -> HTTP ${res.status} - ${JSON.stringify(res.data)}`,
  );

  const items: ListItem[] = res.data?.data ?? [];
  const meta: ListMeta = res.data?.meta ?? ({} as ListMeta);
  assert(Array.isArray(items), `${label}: response "data" is not an array`);
  assert(
    Boolean(res.data?.meta) && typeof res.data?.meta === 'object',
    `${label}: top-level "meta" object is missing`,
  );

  const requiredKeys = [
    'page',
    'limit',
    'total',
    'totalPages',
    'hasNextPage',
    'hasPreviousPage',
  ] as const;
  for (const key of requiredKeys) {
    assert(meta[key] !== undefined, `${label}: meta is missing "${key}"`);
  }

  const expectedTotalPages = meta.total === 0 ? 0 : Math.ceil(meta.total / meta.limit);
  assert(
    meta.totalPages === expectedTotalPages,
    `${label}: meta.totalPages (${meta.totalPages}) != expected (${expectedTotalPages})`,
  );
  assert(
    meta.hasNextPage === meta.page < meta.totalPages,
    `${label}: meta.hasNextPage is inconsistent with page/totalPages`,
  );
  assert(
    meta.hasPreviousPage === meta.page > 1,
    `${label}: meta.hasPreviousPage is inconsistent with page`,
  );
  assert(items.length <= meta.limit, `${label}: page returned more items than the requested limit`);

  return { items, meta };
}

/**
 * Exercises the exact `validateEnv` function the app runs at startup (compiled
 * into dist/config/env.validation.js). Proves the config layer fails fast:
 * throws when a required variable is missing and accepts a complete environment.
 */
function verifyEnvValidation(): void {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const validatorPath = path.join(projectRoot, 'dist', 'config', 'env.validation.js');

  // reflect-metadata mirrors the runtime the validator loads under in the app.
  require('reflect-metadata');
  const mod = require(validatorPath) as {
    validateEnv: (config: Record<string, unknown>) => unknown;
  };
  assert(
    typeof mod.validateEnv === 'function',
    'Compiled validateEnv not found in dist/config/env.validation.js (run npm run build)',
  );

  // Missing required variables (DATABASE_URL / JWT_SECRET) must throw.
  let threwOnMissing = false;
  try {
    mod.validateEnv({ NODE_ENV: 'test' });
  } catch {
    threwOnMissing = true;
  }
  assert(
    threwOnMissing,
    'Environment validation did not throw when required variables were missing',
  );

  // A complete, valid environment must pass without throwing.
  let acceptedValid = true;
  try {
    mod.validateEnv({
      NODE_ENV: 'test',
      PORT: 3000,
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/estateflow',
      JWT_SECRET: 'test-secret-value-0123456789',
      JWT_EXPIRES_IN: '1d',
    });
  } catch {
    acceptedValid = false;
  }
  assert(acceptedValid, 'Environment validation rejected a valid environment');
}

async function run(): Promise<void> {
  info(`Testing API at ${BASE_URL}`);

  const client: AxiosInstance = axios.create({
    baseURL: BASE_URL,
    timeout: 10000,
    // Let us inspect non-2xx responses ourselves instead of throwing generically.
    validateStatus: () => true,
  });

  // 1. Register user (idempotent: a 409 means the user already exists, which is fine)
  const registerRes = await client.post('/auth/register', testUser);
  if (registerRes.status === 201 || registerRes.status === 200) {
    pass('Register successful');
  } else if (registerRes.status === 409) {
    pass('Register successful (user already existed, continuing)');
  } else {
    throw new Error(
      `Register failed: HTTP ${registerRes.status} - ${JSON.stringify(registerRes.data)}`,
    );
  }

  // 2. Login user
  const loginRes = await client.post('/auth/login', {
    email: testUser.email,
    password: testUser.password,
  });
  assert(loginRes.status === 200, `Login failed: HTTP ${loginRes.status}`);
  const token: string | undefined = loginRes.data?.data?.accessToken;
  assert(Boolean(token), 'Login response did not contain an access token');
  pass('Login successful');

  const authHeaders = { Authorization: `Bearer ${token}` };

  // 3. Create property
  const createPropRes = await client.post('/properties', testProperty, { headers: authHeaders });
  assert(
    createPropRes.status === 201 || createPropRes.status === 200,
    `Create property failed: HTTP ${createPropRes.status} - ${JSON.stringify(createPropRes.data)}`,
  );
  const propertyId: string | undefined = createPropRes.data?.data?.id;
  assert(Boolean(propertyId), 'Create property response did not contain an id');
  pass('Property created');

  // 4. Get all properties and verify the created one is present.
  // The list endpoint is paginated: data = [...items], with a top-level meta block.
  const listPropRes = await client.get('/properties', { headers: authHeaders });
  assert(listPropRes.status === 200, `Get properties failed: HTTP ${listPropRes.status}`);
  const properties: Array<{ id: string }> = listPropRes.data?.data ?? [];
  assert(Array.isArray(properties), 'Properties response data is not an array');
  assert(
    properties.some((p) => p.id === propertyId),
    'Created property was not found in the properties list',
  );
  pass('Property fetch successful');

  // 5. Update property status to SOLD
  const updatePropRes = await client.patch(
    `/properties/${propertyId}`,
    { status: 'SOLD' },
    { headers: authHeaders },
  );
  assert(
    updatePropRes.status === 200,
    `Update property failed: HTTP ${updatePropRes.status} - ${JSON.stringify(updatePropRes.data)}`,
  );
  assert(
    updatePropRes.data?.data?.status === 'SOLD',
    `Property status was not updated to SOLD (got: ${updatePropRes.data?.data?.status})`,
  );
  pass('Property update successful');

  // 6. Create client
  const createClientRes = await client.post('/clients', testClient, { headers: authHeaders });
  assert(
    createClientRes.status === 201 || createClientRes.status === 200,
    `Create client failed: HTTP ${createClientRes.status} - ${JSON.stringify(createClientRes.data)}`,
  );
  const clientId: string | undefined = createClientRes.data?.data?.id;
  assert(Boolean(clientId), 'Create client response did not contain an id');
  pass('Client created');

  // 7. Get clients and verify the created one is present (paginated: data array + meta).
  const listClientRes = await client.get('/clients', { headers: authHeaders });
  assert(listClientRes.status === 200, `Get clients failed: HTTP ${listClientRes.status}`);
  const clients: Array<{ id: string }> = listClientRes.data?.data ?? [];
  assert(Array.isArray(clients), 'Clients response data is not an array');
  assert(
    clients.some((c) => c.id === clientId),
    'Created client was not found in the clients list',
  );
  pass('Client fetch successful');

  // 8. Create lead
  const createLeadRes = await client.post('/leads', testLead, { headers: authHeaders });
  assert(
    createLeadRes.status === 201,
    `Create lead failed: POST /leads -> HTTP ${createLeadRes.status} - ${JSON.stringify(
      createLeadRes.data,
    )}`,
  );
  const leadId: string | undefined = createLeadRes.data?.data?.id;
  assert(Boolean(leadId), 'Create lead response did not contain lead data with an id');
  pass('Lead created');

  // 8a. Verify a LEAD_CREATED activity was recorded automatically.
  // The timeline endpoint returns a plain array in `data`, newest first.
  const leadCreatedActivityRes = await client.get(`/leads/${leadId}/activities`, {
    headers: authHeaders,
  });
  assert(
    leadCreatedActivityRes.status === 200,
    `Get lead activities failed: GET /leads/${leadId}/activities -> HTTP ${
      leadCreatedActivityRes.status
    } - ${JSON.stringify(leadCreatedActivityRes.data)}`,
  );
  const leadCreatedActivities: Array<{ type: string; createdAt: string }> =
    leadCreatedActivityRes.data?.data ?? [];
  assert(Array.isArray(leadCreatedActivities), 'Lead activities response data is not an array');
  assert(leadCreatedActivities.length >= 1, 'Expected at least one activity after lead creation');
  assert(
    leadCreatedActivities.some((a) => a.type === 'LEAD_CREATED'),
    'LEAD_CREATED activity was not found in the lead timeline after creating the lead',
  );
  pass('Lead activity created successfully');

  // 9. Get all leads and verify the created one is present.
  // The list endpoint is paginated: data = { items: [...], meta: {...} }.
  const listLeadRes = await client.get('/leads', { headers: authHeaders });
  assert(
    listLeadRes.status === 200,
    `Get leads failed: GET /leads -> HTTP ${listLeadRes.status} - ${JSON.stringify(
      listLeadRes.data,
    )}`,
  );
  const leads: Array<{ id: string }> = listLeadRes.data?.data ?? [];
  assert(Array.isArray(leads), 'Leads response data is not an array');
  assert(
    leads.some((l) => l.id === leadId),
    'Created lead was not found in the leads list',
  );
  pass('Lead fetch successful');

  // 10. Get single lead by id
  const getLeadRes = await client.get(`/leads/${leadId}`, { headers: authHeaders });
  assert(
    getLeadRes.status === 200,
    `Get single lead failed: GET /leads/${leadId} -> HTTP ${getLeadRes.status} - ${JSON.stringify(
      getLeadRes.data,
    )}`,
  );
  assert(
    getLeadRes.data?.data?.id === leadId,
    `Returned lead id does not match created lead id (got: ${getLeadRes.data?.data?.id})`,
  );
  pass('Single lead fetch successful');

  // 11. Update lead status to INTERESTED
  const updateLeadRes = await client.patch(
    `/leads/${leadId}`,
    { status: 'INTERESTED' },
    { headers: authHeaders },
  );
  assert(
    updateLeadRes.status === 200,
    `Update lead failed: PATCH /leads/${leadId} -> HTTP ${updateLeadRes.status} - ${JSON.stringify(
      updateLeadRes.data,
    )}`,
  );
  assert(
    updateLeadRes.data?.data?.status === 'INTERESTED',
    `Lead status was not updated to INTERESTED (got: ${updateLeadRes.data?.data?.status})`,
  );
  pass('Lead status updated');

  // 11a. Verify a STATUS_CHANGED activity was recorded for the status update.
  const statusActivityRes = await client.get(`/leads/${leadId}/activities`, {
    headers: authHeaders,
  });
  assert(
    statusActivityRes.status === 200,
    `Get lead activities failed: GET /leads/${leadId}/activities -> HTTP ${
      statusActivityRes.status
    } - ${JSON.stringify(statusActivityRes.data)}`,
  );
  const statusActivities: Array<{ type: string; createdAt: string }> =
    statusActivityRes.data?.data ?? [];
  assert(
    statusActivities.some((a) => a.type === 'STATUS_CHANGED'),
    'STATUS_CHANGED activity was not found in the lead timeline after updating the status',
  );
  pass('Lead status activity verified');

  // 12. Filter leads by status
  const filterLeadRes = await client.get('/leads?status=INTERESTED', { headers: authHeaders });
  assert(
    filterLeadRes.status === 200,
    `Filter leads failed: GET /leads?status=INTERESTED -> HTTP ${filterLeadRes.status} - ${JSON.stringify(
      filterLeadRes.data,
    )}`,
  );
  const filteredLeads: Array<{ id: string; status: string }> = filterLeadRes.data?.data ?? [];
  assert(Array.isArray(filteredLeads), 'Filtered leads response data is not an array');
  assert(
    filteredLeads.some((l) => l.id === leadId),
    'Updated lead was not found when filtering by status=INTERESTED',
  );
  assert(
    filteredLeads.every((l) => l.status === 'INTERESTED'),
    'Status filter returned leads with a different status',
  );
  pass('Lead filtering successful');

  // 14. Create visit (reuses the property, client and lead created earlier).
  // Passing leadId links the visit to the lead so its activities appear on the
  // lead timeline. The lead is deleted later, after the activity checks.
  const createVisitRes = await client.post(
    '/visits',
    { clientId, propertyId, leadId, ...testVisit },
    { headers: authHeaders },
  );
  assert(
    createVisitRes.status === 201,
    `Create visit failed: POST /visits -> HTTP ${createVisitRes.status} - ${JSON.stringify(
      createVisitRes.data,
    )}`,
  );
  const visitId: string | undefined = createVisitRes.data?.data?.id;
  assert(Boolean(visitId), 'Create visit response did not contain visit data with an id');
  pass('Visit created');

  // 14a. Verify a VISIT_CREATED activity was recorded on the lead timeline.
  const visitActivityRes = await client.get(`/leads/${leadId}/activities`, {
    headers: authHeaders,
  });
  assert(
    visitActivityRes.status === 200,
    `Get lead activities failed: GET /leads/${leadId}/activities -> HTTP ${
      visitActivityRes.status
    } - ${JSON.stringify(visitActivityRes.data)}`,
  );
  const visitActivities: Array<{ type: string; createdAt: string }> =
    visitActivityRes.data?.data ?? [];
  assert(Array.isArray(visitActivities), 'Lead activities response data is not an array');
  assert(
    visitActivities.some((a) => a.type === 'VISIT_CREATED'),
    'VISIT_CREATED activity was not found in the lead timeline after creating the visit',
  );
  pass('Visit activity verified');

  // 14b. Verify activities are returned latest-first (createdAt non-increasing).
  const timestamps = visitActivities.map((a) => new Date(a.createdAt).getTime());
  const isDescending = timestamps.every((t, i) => i === 0 || timestamps[i - 1] >= t);
  assert(isDescending, 'Activities are not ordered latest-first by createdAt');
  assert(
    timestamps.length === 0 || timestamps[0] === Math.max(...timestamps),
    'activities[0] does not hold the latest createdAt value',
  );
  pass('Activity ordering verified');

  // 15. Get all visits and verify the created one is present (paginated: data array + meta).
  const listVisitRes = await client.get('/visits', { headers: authHeaders });
  assert(
    listVisitRes.status === 200,
    `Get visits failed: GET /visits -> HTTP ${listVisitRes.status} - ${JSON.stringify(
      listVisitRes.data,
    )}`,
  );
  const visits: Array<{ id: string }> = listVisitRes.data?.data ?? [];
  assert(Array.isArray(visits), 'Visits response data is not an array');
  assert(
    visits.some((v) => v.id === visitId),
    'Created visit was not found in the visits list',
  );
  pass('Visit fetch successful');

  // 16. Get single visit by id
  const getVisitRes = await client.get(`/visits/${visitId}`, { headers: authHeaders });
  assert(
    getVisitRes.status === 200,
    `Get single visit failed: GET /visits/${visitId} -> HTTP ${getVisitRes.status} - ${JSON.stringify(
      getVisitRes.data,
    )}`,
  );
  assert(
    getVisitRes.data?.data?.id === visitId,
    `Returned visit id does not match created visit id (got: ${getVisitRes.data?.data?.id})`,
  );
  pass('Single visit fetch successful');

  // 17. Update visit status to COMPLETED
  const updateVisitRes = await client.patch(
    `/visits/${visitId}`,
    { status: 'COMPLETED', notes: 'Customer completed property visit' },
    { headers: authHeaders },
  );
  assert(
    updateVisitRes.status === 200,
    `Update visit failed: PATCH /visits/${visitId} -> HTTP ${updateVisitRes.status} - ${JSON.stringify(
      updateVisitRes.data,
    )}`,
  );
  assert(
    updateVisitRes.data?.data?.status === 'COMPLETED',
    `Visit status was not updated to COMPLETED (got: ${updateVisitRes.data?.data?.status})`,
  );
  pass('Visit status updated');

  // 18. Filter visits by status
  const filterVisitRes = await client.get('/visits?status=COMPLETED', { headers: authHeaders });
  assert(
    filterVisitRes.status === 200,
    `Filter visits failed: GET /visits?status=COMPLETED -> HTTP ${filterVisitRes.status} - ${JSON.stringify(
      filterVisitRes.data,
    )}`,
  );
  const filteredVisits: Array<{ id: string; status: string }> = filterVisitRes.data?.data ?? [];
  assert(Array.isArray(filteredVisits), 'Filtered visits response data is not an array');
  assert(
    filteredVisits.some((v) => v.id === visitId),
    'Updated visit was not found when filtering by status=COMPLETED',
  );
  assert(
    filteredVisits.every((v) => v.status === 'COMPLETED'),
    'Status filter returned visits with a different status',
  );
  pass('Visit filtering successful');

  // ---------------------------------------------------------------------------
  // Dashboard Analytics. These run while all business data still exists (before
  // the visit/lead cleanup below), so the aggregate counts are non-empty.
  // The overview response is flat (totalProperties, totalClients, ...).
  // ---------------------------------------------------------------------------

  // 19. Dashboard overview
  const overviewRes = await client.get('/dashboard/overview', { headers: authHeaders });
  assert(
    overviewRes.status === 200,
    `Get dashboard overview failed: GET /dashboard/overview -> HTTP ${overviewRes.status} - ${JSON.stringify(
      overviewRes.data,
    )}`,
  );
  const overview: {
    totalProperties?: number;
    totalClients?: number;
    totalLeads?: number;
    scheduledVisits?: number;
    completedVisits?: number;
    cancelledVisits?: number;
  } = overviewRes.data?.data ?? {};
  assert(
    typeof overview.totalProperties === 'number' &&
      typeof overview.totalClients === 'number' &&
      typeof overview.totalLeads === 'number',
    'Dashboard overview is missing property/client/lead totals',
  );
  assert(
    typeof overview.scheduledVisits === 'number' &&
      typeof overview.completedVisits === 'number' &&
      typeof overview.cancelledVisits === 'number',
    'Dashboard overview is missing scheduled/completed/cancelled visit counts',
  );
  assert(
    (overview.totalProperties ?? 0) >= 1,
    `Expected at least one property in the overview (got: ${overview.totalProperties})`,
  );
  assert(
    (overview.totalClients ?? 0) >= 1,
    `Expected at least one client in the overview (got: ${overview.totalClients})`,
  );
  assert(
    (overview.totalLeads ?? 0) >= 1,
    `Expected at least one lead in the overview (got: ${overview.totalLeads})`,
  );
  pass('Dashboard overview verified');

  // 20. Recent activities
  const recentActivitiesRes = await client.get('/dashboard/recent-activities', {
    headers: authHeaders,
  });
  assert(
    recentActivitiesRes.status === 200,
    `Get recent activities failed: GET /dashboard/recent-activities -> HTTP ${
      recentActivitiesRes.status
    } - ${JSON.stringify(recentActivitiesRes.data)}`,
  );
  const recentActivities: Array<{ type: string; description: string; createdAt: string }> =
    recentActivitiesRes.data?.data ?? [];
  assert(Array.isArray(recentActivities), 'Recent activities response data is not an array');
  assert(recentActivities.length > 0, 'Expected at least one recent activity');
  const firstActivity = recentActivities[0];
  assert(
    typeof firstActivity.type === 'string' &&
      typeof firstActivity.description === 'string' &&
      typeof firstActivity.createdAt === 'string',
    'First recent activity is missing type, description or createdAt',
  );
  pass('Recent activities verified');

  // 21. Lead pipeline
  const pipelineRes = await client.get('/dashboard/lead-pipeline', { headers: authHeaders });
  assert(
    pipelineRes.status === 200,
    `Get lead pipeline failed: GET /dashboard/lead-pipeline -> HTTP ${pipelineRes.status} - ${JSON.stringify(
      pipelineRes.data,
    )}`,
  );
  const pipeline: Array<{ status: string; count: number }> = pipelineRes.data?.data ?? [];
  assert(Array.isArray(pipeline), 'Lead pipeline response data is not an array');
  const pipelineStatuses = new Set(pipeline.map((entry) => entry.status));
  const expectedLeadStatuses = [
    'NEW',
    'CONTACTED',
    'INTERESTED',
    'VISIT_SCHEDULED',
    'NEGOTIATION',
    'WON',
    'LOST',
  ];
  assert(
    expectedLeadStatuses.every((status) => pipelineStatuses.has(status)),
    'Lead pipeline is missing one or more lead status buckets',
  );
  pass('Lead pipeline verified');

  // 22. Property distribution
  const distributionRes = await client.get('/dashboard/property-distribution', {
    headers: authHeaders,
  });
  assert(
    distributionRes.status === 200,
    `Get property distribution failed: GET /dashboard/property-distribution -> HTTP ${
      distributionRes.status
    } - ${JSON.stringify(distributionRes.data)}`,
  );
  const distribution: {
    byType?: Array<{ propertyType: string; count: number }>;
    byStatus?: Array<{ status: string; count: number }>;
  } = distributionRes.data?.data ?? {};
  assert(
    Array.isArray(distribution.byType) && Array.isArray(distribution.byStatus),
    'Property distribution is missing byType or byStatus arrays',
  );
  pass('Property distribution verified');

  // 23. Upcoming visits (each item must carry visitDate, client and property)
  const upcomingVisitsRes = await client.get('/dashboard/upcoming-visits', {
    headers: authHeaders,
  });
  assert(
    upcomingVisitsRes.status === 200,
    `Get upcoming visits failed: GET /dashboard/upcoming-visits -> HTTP ${
      upcomingVisitsRes.status
    } - ${JSON.stringify(upcomingVisitsRes.data)}`,
  );
  const upcomingVisits: Array<{ visitDate?: string; client?: unknown; property?: unknown }> =
    upcomingVisitsRes.data?.data ?? [];
  assert(Array.isArray(upcomingVisits), 'Upcoming visits response data is not an array');
  assert(
    upcomingVisits.every(
      (visit) => Boolean(visit.visitDate) && Boolean(visit.client) && Boolean(visit.property),
    ),
    'An upcoming visit is missing visitDate, client or property',
  );
  pass('Upcoming visits verified');

  // 24. Monthly summary
  const monthlySummaryRes = await client.get('/dashboard/monthly-summary', {
    headers: authHeaders,
  });
  assert(
    monthlySummaryRes.status === 200,
    `Get monthly summary failed: GET /dashboard/monthly-summary -> HTTP ${
      monthlySummaryRes.status
    } - ${JSON.stringify(monthlySummaryRes.data)}`,
  );
  const monthlySummary: Array<{
    month: string;
    newLeads: number;
    completedVisits: number;
    wonDeals: number;
  }> = monthlySummaryRes.data?.data ?? [];
  assert(Array.isArray(monthlySummary), 'Monthly summary response data is not an array');
  assert(monthlySummary.length > 0, 'Monthly summary did not contain any monthly buckets');
  assert(
    monthlySummary.every(
      (entry) =>
        typeof entry.month === 'string' &&
        typeof entry.newLeads === 'number' &&
        typeof entry.completedVisits === 'number' &&
        typeof entry.wonDeals === 'number',
    ),
    'A monthly summary entry is missing expected fields (month, newLeads, completedVisits, wonDeals)',
  );
  pass('Monthly summary verified');

  // ---------------------------------------------------------------------------
  // Search, Filter, Sorting and Pagination. Runs while the created property,
  // client, lead and visit still exist. Every list response is validated by
  // assertPaginated (200 + items array + consistent meta object).
  // ---------------------------------------------------------------------------

  // The agent id backing the created records (used for the "agent" filters).
  const agentId: string = createLeadRes.data?.data?.assignedAgentId;

  // --- Properties: search ---
  const propSearchUrl = '/properties?search=Modern';
  const propSearch = assertPaginated(
    'Property search',
    propSearchUrl,
    await client.get(propSearchUrl, { headers: authHeaders }),
  );
  assert(
    propSearch.items.every((p) =>
      `${String(p.title)} ${String(p.description)} ${String(p.location)}`
        .toLowerCase()
        .includes('modern'),
    ),
    'Property search returned an item not matching the search term',
  );
  pass('Property search verified');

  // --- Properties: filter by status, propertyType, price range, bedrooms ---
  const propStatusUrl = '/properties?status=SOLD';
  const propByStatus = assertPaginated(
    'Property status filter',
    propStatusUrl,
    await client.get(propStatusUrl, { headers: authHeaders }),
  );
  assert(
    propByStatus.items.every((p) => p.status === 'SOLD'),
    'Property status filter returned a property that is not SOLD',
  );

  const propTypeUrl = '/properties?propertyType=APARTMENT';
  const propByType = assertPaginated(
    'Property type filter',
    propTypeUrl,
    await client.get(propTypeUrl, { headers: authHeaders }),
  );
  assert(
    propByType.items.every((p) => p.propertyType === 'APARTMENT'),
    'Property type filter returned a non-APARTMENT property',
  );

  const propPriceUrl = '/properties?minPrice=1000000&maxPrice=9000000';
  const propByPrice = assertPaginated(
    'Property price range',
    propPriceUrl,
    await client.get(propPriceUrl, { headers: authHeaders }),
  );
  assert(
    propByPrice.items.every((p) => {
      const price = Number(p.price);
      return price >= 1000000 && price <= 9000000;
    }),
    'Property price range returned a property outside the requested range',
  );

  const propBedsUrl = '/properties?minBedrooms=2&maxBedrooms=3';
  const propByBeds = assertPaginated(
    'Property bedrooms filter',
    propBedsUrl,
    await client.get(propBedsUrl, { headers: authHeaders }),
  );
  assert(
    propByBeds.items.every((p) => {
      const bedrooms = Number(p.bedrooms);
      return bedrooms >= 2 && bedrooms <= 3;
    }),
    'Property bedrooms filter returned a property outside the requested range',
  );
  pass('Property filter verified');

  // --- Properties: sorting ascending and descending ---
  const propAscUrl = '/properties?sortBy=price&sortOrder=asc&limit=100';
  const propAsc = assertPaginated(
    'Property sort ascending',
    propAscUrl,
    await client.get(propAscUrl, { headers: authHeaders }),
  );
  const ascPrices = propAsc.items.map((p) => Number(p.price));
  assert(
    ascPrices.every((price, i) => i === 0 || ascPrices[i - 1] <= price),
    'Properties are not sorted by price ascending',
  );

  const propDescUrl = '/properties?sortBy=price&sortOrder=desc&limit=100';
  const propDesc = assertPaginated(
    'Property sort descending',
    propDescUrl,
    await client.get(propDescUrl, { headers: authHeaders }),
  );
  const descPrices = propDesc.items.map((p) => Number(p.price));
  assert(
    descPrices.every((price, i) => i === 0 || descPrices[i - 1] >= price),
    'Properties are not sorted by price descending',
  );
  pass('Property sorting verified');

  // --- Properties: pagination ---
  const propPage1Url = '/properties?page=1&limit=2';
  const propPage1 = assertPaginated(
    'Property pagination',
    propPage1Url,
    await client.get(propPage1Url, { headers: authHeaders }),
  );
  assert(
    propPage1.meta.page === 1 && propPage1.meta.limit === 2,
    'Property pagination meta page/limit are incorrect',
  );
  if (propPage1.meta.totalPages > 1) {
    const propPage2Url = '/properties?page=2&limit=2';
    const propPage2 = assertPaginated(
      'Property pagination (page 2)',
      propPage2Url,
      await client.get(propPage2Url, { headers: authHeaders }),
    );
    assert(
      propPage2.meta.page === 2 && propPage2.meta.hasPreviousPage === true,
      'Property page 2 should report hasPreviousPage = true',
    );
  }
  pass('Property pagination verified');

  // --- Clients: search ---
  const clientSearchUrl = '/clients?search=Test';
  const clientSearch = assertPaginated(
    'Client search',
    clientSearchUrl,
    await client.get(clientSearchUrl, { headers: authHeaders }),
  );
  assert(clientSearch.meta.total >= 1, 'Client search for "Test" should match the created client');
  pass('Client search verified');

  // --- Clients: budget filter, preferred location filter, pagination ---
  const clientBudgetUrl = '/clients?minBudget=1000000&maxBudget=9000000';
  const clientByBudget = assertPaginated(
    'Client budget filter',
    clientBudgetUrl,
    await client.get(clientBudgetUrl, { headers: authHeaders }),
  );
  assert(
    clientByBudget.items.every((c) => {
      const budget = Number(c.budget);
      return budget >= 1000000 && budget <= 9000000;
    }),
    'Client budget filter returned a client outside the requested range',
  );

  const clientLocationUrl = '/clients?preferredLocation=Gulshan';
  const clientByLocation = assertPaginated(
    'Client preferred location filter',
    clientLocationUrl,
    await client.get(clientLocationUrl, { headers: authHeaders }),
  );
  assert(
    clientByLocation.items.every((c) =>
      String(c.preferredLocation).toLowerCase().includes('gulshan'),
    ),
    'Client location filter returned a client with a different preferred location',
  );

  const clientPageUrl = '/clients?page=1&limit=2';
  const clientPage = assertPaginated(
    'Client pagination',
    clientPageUrl,
    await client.get(clientPageUrl, { headers: authHeaders }),
  );
  assert(clientPage.meta.limit === 2, 'Client pagination meta limit is incorrect');
  pass('Client filtering verified');

  // --- Leads: status, source, agent, date range, pagination ---
  const leadStatusUrl = '/leads?status=INTERESTED';
  const leadByStatus = assertPaginated(
    'Lead status filter',
    leadStatusUrl,
    await client.get(leadStatusUrl, { headers: authHeaders }),
  );
  assert(leadByStatus.meta.total >= 1, 'Lead status filter should include the updated lead');
  assert(
    leadByStatus.items.every((l) => l.status === 'INTERESTED'),
    'Lead status filter returned a lead with a different status',
  );

  const leadSourceUrl = '/leads?source=facebook';
  const leadBySource = assertPaginated(
    'Lead source filter',
    leadSourceUrl,
    await client.get(leadSourceUrl, { headers: authHeaders }),
  );
  assert(
    leadBySource.items.every((l) => String(l.source).toLowerCase().includes('facebook')),
    'Lead source filter returned a lead from a different source',
  );

  const leadAgentUrl = `/leads?assignedAgent=${agentId}`;
  const leadByAgent = assertPaginated(
    'Lead agent filter',
    leadAgentUrl,
    await client.get(leadAgentUrl, { headers: authHeaders }),
  );
  assert(
    leadByAgent.items.every((l) => l.assignedAgentId === agentId),
    'Lead agent filter returned a lead assigned to a different agent',
  );

  const leadDateUrl =
    '/leads?createdFrom=2000-01-01T00:00:00.000Z&createdTo=2100-01-01T00:00:00.000Z';
  const leadByDate = assertPaginated(
    'Lead date range filter',
    leadDateUrl,
    await client.get(leadDateUrl, { headers: authHeaders }),
  );
  assert(leadByDate.meta.total >= 1, 'Lead date range should include the created lead');

  const leadPageUrl = '/leads?page=1&limit=2';
  const leadPage = assertPaginated(
    'Lead pagination',
    leadPageUrl,
    await client.get(leadPageUrl, { headers: authHeaders }),
  );
  assert(leadPage.meta.limit === 2, 'Lead pagination meta limit is incorrect');
  pass('Lead filtering verified');

  // --- Visits: status, date range, agent, pagination ---
  const visitStatusUrl = '/visits?status=COMPLETED';
  const visitByStatus = assertPaginated(
    'Visit status filter',
    visitStatusUrl,
    await client.get(visitStatusUrl, { headers: authHeaders }),
  );
  assert(visitByStatus.meta.total >= 1, 'Visit status filter should include the completed visit');
  assert(
    visitByStatus.items.every((v) => v.status === 'COMPLETED'),
    'Visit status filter returned a visit with a different status',
  );

  const visitDateUrl = '/visits?fromDate=2000-01-01T00:00:00.000Z&toDate=2100-01-01T00:00:00.000Z';
  const visitByDate = assertPaginated(
    'Visit date range filter',
    visitDateUrl,
    await client.get(visitDateUrl, { headers: authHeaders }),
  );
  assert(visitByDate.meta.total >= 1, 'Visit date range should include the created visit');

  const visitAgentUrl = `/visits?agentId=${agentId}`;
  const visitByAgent = assertPaginated(
    'Visit agent filter',
    visitAgentUrl,
    await client.get(visitAgentUrl, { headers: authHeaders }),
  );
  assert(
    visitByAgent.items.every((v) => v.agentId === agentId),
    'Visit agent filter returned a visit assigned to a different agent',
  );

  const visitPageUrl = '/visits?page=1&limit=2';
  const visitPage = assertPaginated(
    'Visit pagination',
    visitPageUrl,
    await client.get(visitPageUrl, { headers: authHeaders }),
  );
  assert(visitPage.meta.limit === 2, 'Visit pagination meta limit is incorrect');
  pass('Visit filtering verified');

  // ---------------------------------------------------------------------------
  // Reports. Runs while the created business data still exists. Report
  // responses use the standard { success, message, data } envelope (except the
  // CSV export, which streams a raw text/csv body).
  // ---------------------------------------------------------------------------

  // Sales report
  const salesReportRes = await client.get('/reports/sales', { headers: authHeaders });
  assert(
    salesReportRes.status === 200,
    `Sales report failed: GET /reports/sales -> HTTP ${salesReportRes.status} - ${JSON.stringify(
      salesReportRes.data,
    )}`,
  );
  const salesReport = (salesReportRes.data?.data ?? {}) as {
    totalDeals?: unknown;
    totalRevenue?: unknown;
    averageDealValue?: unknown;
  };
  assert(typeof salesReport.totalDeals === 'number', 'Sales report is missing totalDeals');
  assert(typeof salesReport.totalRevenue === 'number', 'Sales report is missing totalRevenue');
  assert(
    typeof salesReport.averageDealValue === 'number',
    'Sales report is missing averageDealValue',
  );
  pass('Sales report verified');

  // Leads report (grouped lead statistics)
  const leadReportRes = await client.get('/reports/leads', { headers: authHeaders });
  assert(
    leadReportRes.status === 200,
    `Lead report failed: GET /reports/leads -> HTTP ${leadReportRes.status} - ${JSON.stringify(
      leadReportRes.data,
    )}`,
  );
  const leadReport = (leadReportRes.data?.data ?? {}) as {
    total?: unknown;
    byStatus?: Array<{ status?: unknown; count?: unknown }>;
  };
  const leadBuckets = Array.isArray(leadReport.byStatus) ? leadReport.byStatus : [];
  assert(leadBuckets.length > 0, 'Lead report did not return grouped lead statistics');
  assert(
    leadBuckets.every(
      (bucket) => typeof bucket.status === 'string' && typeof bucket.count === 'number',
    ),
    'Lead report status buckets are malformed',
  );
  pass('Lead report verified');

  // Agents report (per-agent performance)
  const agentReportRes = await client.get('/reports/agents', { headers: authHeaders });
  assert(
    agentReportRes.status === 200,
    `Agent report failed: GET /reports/agents -> HTTP ${agentReportRes.status} - ${JSON.stringify(
      agentReportRes.data,
    )}`,
  );
  const agentReport = (agentReportRes.data?.data ?? []) as Array<{
    totalLeads?: unknown;
    totalVisits?: unknown;
    wonDeals?: unknown;
    assignedProperties?: unknown;
  }>;
  assert(
    Array.isArray(agentReport) && agentReport.length > 0,
    'Agent report did not return any agent statistics',
  );
  const firstAgent = agentReport[0];
  assert(
    typeof firstAgent.totalLeads === 'number' &&
      typeof firstAgent.totalVisits === 'number' &&
      typeof firstAgent.wonDeals === 'number' &&
      typeof firstAgent.assignedProperties === 'number',
    'Agent report row is missing numeric statistics',
  );
  pass('Agent performance report verified');

  // Properties report (portfolio analytics)
  const propertyReportRes = await client.get('/reports/properties', { headers: authHeaders });
  assert(
    propertyReportRes.status === 200,
    `Property report failed: GET /reports/properties -> HTTP ${
      propertyReportRes.status
    } - ${JSON.stringify(propertyReportRes.data)}`,
  );
  const propertyReport = (propertyReportRes.data?.data ?? {}) as {
    total?: unknown;
    available?: unknown;
    sold?: unknown;
    rented?: unknown;
    averagePrice?: unknown;
    averageArea?: unknown;
  };
  assert(
    typeof propertyReport.total === 'number' &&
      typeof propertyReport.available === 'number' &&
      typeof propertyReport.sold === 'number' &&
      typeof propertyReport.rented === 'number' &&
      typeof propertyReport.averagePrice === 'number' &&
      typeof propertyReport.averageArea === 'number',
    'Property report did not return the expected analytics',
  );
  pass('Property report verified');

  // Visits report (visit analytics)
  const visitReportRes = await client.get('/reports/visits', { headers: authHeaders });
  assert(
    visitReportRes.status === 200,
    `Visit report failed: GET /reports/visits -> HTTP ${visitReportRes.status} - ${JSON.stringify(
      visitReportRes.data,
    )}`,
  );
  const visitReport = (visitReportRes.data?.data ?? {}) as {
    scheduled?: unknown;
    completed?: unknown;
    cancelled?: unknown;
    total?: unknown;
    completionRate?: unknown;
  };
  assert(
    typeof visitReport.scheduled === 'number' &&
      typeof visitReport.completed === 'number' &&
      typeof visitReport.cancelled === 'number' &&
      typeof visitReport.total === 'number' &&
      typeof visitReport.completionRate === 'number',
    'Visit report did not return the expected analytics',
  );
  pass('Visit report verified');

  // CSV export (raw text/csv, not the JSON envelope)
  const csvRes = await client.get('/reports/export/csv', { headers: authHeaders });
  assert(
    csvRes.status === 200,
    `CSV export failed: GET /reports/export/csv -> HTTP ${csvRes.status} - ${JSON.stringify(
      csvRes.data,
    )}`,
  );
  const csvContentType = String(csvRes.headers['content-type'] ?? '');
  assert(
    csvContentType.includes('text/csv'),
    `CSV export Content-Type is not text/csv (got: ${csvContentType})`,
  );
  const csvBody = typeof csvRes.data === 'string' ? csvRes.data : String(csvRes.data ?? '');
  assert(csvBody.trim().length > 0, 'CSV export response body is empty');
  pass('CSV export verified');

  // ---------------------------------------------------------------------------
  // Common infrastructure regression tests. These exercise the shared response
  // envelope, pagination/sorting/search helpers, validation, the auth guards and
  // the custom exceptions provided by the common layer. They run while the
  // created business data still exists (before the cleanup deletes below).
  // ---------------------------------------------------------------------------

  // 1. Standard response format: { success, message, data, meta }
  const envelopeRes = await client.get(`/properties/${propertyId}`, { headers: authHeaders });
  assert(
    envelopeRes.status === 200,
    `Response format check failed: GET /properties/${propertyId} -> HTTP ${envelopeRes.status}`,
  );
  const envelope = (envelopeRes.data ?? {}) as Record<string, unknown>;
  assert(envelope.success === true, 'Response envelope is missing "success: true"');
  assert(typeof envelope.message === 'string', 'Response envelope is missing a string "message"');
  assert('data' in envelope, 'Response envelope is missing "data"');
  assert('meta' in envelope, 'Response envelope is missing "meta"');
  assert(envelope.meta === null, 'A non-list response should carry meta === null');
  pass('Response format verified');

  // 2. Pagination metadata: page, limit, total, totalPages
  const pagRes = await client.get('/properties?page=1&limit=2', { headers: authHeaders });
  assert(pagRes.status === 200, `Pagination check failed: HTTP ${pagRes.status}`);
  const pagItems = pagRes.data?.data;
  const pagMeta = pagRes.data?.meta as ListMeta | undefined;
  assert(Array.isArray(pagItems), 'Paginated "data" should be an array');
  assert(Boolean(pagMeta) && typeof pagMeta === 'object', 'Paginated response is missing "meta"');
  for (const key of ['page', 'limit', 'total', 'totalPages'] as const) {
    assert(typeof pagMeta?.[key] === 'number', `Pagination meta is missing numeric "${key}"`);
  }
  assert(pagMeta?.page === 1, `Pagination meta.page should be 1 (got ${pagMeta?.page})`);
  assert(pagMeta?.limit === 2, `Pagination meta.limit should be 2 (got ${pagMeta?.limit})`);
  assert((pagItems as unknown[]).length <= 2, 'Pagination returned more items than the limit');
  pass('Pagination verified');

  // 3. Sorting: ascending and descending order
  const ascRes = await client.get('/properties?sortBy=price&sortOrder=asc&limit=50', {
    headers: authHeaders,
  });
  const descRes = await client.get('/properties?sortBy=price&sortOrder=desc&limit=50', {
    headers: authHeaders,
  });
  assert(
    ascRes.status === 200 && descRes.status === 200,
    'Sorting requests did not both return HTTP 200',
  );
  const ascSorted = ((ascRes.data?.data ?? []) as Array<{ price: unknown }>).map((p) =>
    Number(p.price),
  );
  const descSorted = ((descRes.data?.data ?? []) as Array<{ price: unknown }>).map((p) =>
    Number(p.price),
  );
  assert(
    ascSorted.every((v, i) => i === 0 || ascSorted[i - 1] <= v),
    'Ascending sort did not return non-decreasing prices',
  );
  assert(
    descSorted.every((v, i) => i === 0 || descSorted[i - 1] >= v),
    'Descending sort did not return non-increasing prices',
  );
  pass('Sorting verified');

  // 4. Search returns matching records
  const searchRes = await client.get('/properties?search=Modern&limit=50', {
    headers: authHeaders,
  });
  assert(searchRes.status === 200, `Search check failed: HTTP ${searchRes.status}`);
  const searchItems = (searchRes.data?.data ?? []) as Array<{
    title?: string;
    description?: string;
    location?: string;
  }>;
  assert(searchItems.length > 0, 'Search for "Modern" returned no records');
  assert(
    searchItems.every((p) =>
      [p.title, p.description, p.location].some((field) =>
        String(field ?? '')
          .toLowerCase()
          .includes('modern'),
      ),
    ),
    'Search returned a record that does not match the search term',
  );
  pass('Search verified');

  // 5. Validation: an invalid payload must yield HTTP 400 with a validation message
  const invalidRes = await client.post(
    '/properties',
    { title: '', price: 'not-a-number', bedrooms: -1, propertyType: 'INVALID', status: 'NOPE' },
    { headers: authHeaders },
  );
  assert(
    invalidRes.status === 400,
    `Validation check failed: expected 400, got ${invalidRes.status} - ${JSON.stringify(
      invalidRes.data,
    )}`,
  );
  assert(invalidRes.data?.success === false, 'Validation error envelope should have success: false');
  assert(
    typeof invalidRes.data?.message === 'string' && invalidRes.data.message.length > 0,
    'Validation error is missing a message',
  );
  assert(
    Array.isArray(invalidRes.data?.errors) && invalidRes.data.errors.length > 0,
    'Validation error did not include a non-empty errors array',
  );
  pass('Validation verified');

  // 6. Unauthorized access: a protected endpoint without a JWT must return 401
  const noAuthRes = await client.get('/properties');
  assert(
    noAuthRes.status === 401,
    `Unauthorized check failed: expected 401, got ${noAuthRes.status}`,
  );
  pass('Unauthorized access verified');

  // 7. Invalid JWT: a malformed token must return 401
  const badJwtRes = await client.get('/properties', {
    headers: { Authorization: 'Bearer invalid.token.value' },
  });
  assert(
    badJwtRes.status === 401,
    `Invalid JWT check failed: expected 401, got ${badJwtRes.status}`,
  );
  pass('Invalid JWT verified');

  // 8. Not Found: the custom ResourceNotFoundException envelope
  const missingId = '00000000-0000-4000-8000-000000000000';
  const notFoundRes = await client.get(`/properties/${missingId}`, { headers: authHeaders });
  assert(
    notFoundRes.status === 404,
    `Not Found check failed: expected 404, got ${notFoundRes.status}`,
  );
  assert(notFoundRes.data?.success === false, 'Not Found envelope should have success: false');
  assert(
    typeof notFoundRes.data?.message === 'string' &&
      notFoundRes.data.message.toLowerCase().includes('not found'),
    `Not Found response is not from the custom exception (got: ${notFoundRes.data?.message})`,
  );
  pass('Custom exception verified');

  // 9. Environment validation: the app must fail fast when a required env var is missing
  verifyEnvValidation();
  pass('Environment validation verified');

  // 25. Delete visit
  const deleteVisitRes = await client.delete(`/visits/${visitId}`, { headers: authHeaders });
  assert(
    deleteVisitRes.status === 200 || deleteVisitRes.status === 204,
    `Delete visit failed: DELETE /visits/${visitId} -> HTTP ${deleteVisitRes.status} - ${JSON.stringify(
      deleteVisitRes.data,
    )}`,
  );
  pass('Visit deleted');

  // 26. Delete lead (done last so it survives the activity-timeline and dashboard checks above)
  const deleteLeadRes = await client.delete(`/leads/${leadId}`, { headers: authHeaders });
  assert(
    deleteLeadRes.status === 200 || deleteLeadRes.status === 204,
    `Delete lead failed: DELETE /leads/${leadId} -> HTTP ${deleteLeadRes.status} - ${JSON.stringify(
      deleteLeadRes.data,
    )}`,
  );
  pass('Lead deleted');

  // ---------------------------------------------------------------------------
  // Soft delete, audit tracking & transaction verification.
  //
  // Uses the seeded admin account (admin@estateflow.com) because includeDeleted
  // is honoured for admins only, and admins can view every property regardless
  // of owner. Runs before the rate-limit probe so the extra login is safe.
  // ---------------------------------------------------------------------------
  const adminLoginRes = await client.post('/auth/login', {
    email: 'admin@estateflow.com',
    password: 'Password123!',
  });
  assert(
    adminLoginRes.status === 200 || adminLoginRes.status === 201,
    `Admin login failed (is the database seeded with admin@estateflow.com?): HTTP ${adminLoginRes.status} - ${JSON.stringify(
      adminLoginRes.data,
    )}`,
  );
  const adminToken: string | undefined =
    adminLoginRes.data?.data?.accessToken ?? adminLoginRes.data?.data?.token;
  assert(Boolean(adminToken), 'Admin login response did not contain an access token');
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };

  // 1. Create property -> createdById audit field is populated.
  const auditCreateRes = await client.post('/properties', testProperty, { headers: adminHeaders });
  assert(
    auditCreateRes.status === 201 || auditCreateRes.status === 200,
    `Audit create failed: POST /properties -> HTTP ${auditCreateRes.status} - ${JSON.stringify(
      auditCreateRes.data,
    )}`,
  );
  const auditPropertyId: string | undefined = auditCreateRes.data?.data?.id;
  assert(Boolean(auditPropertyId), 'Audit property create did not return an id');
  assert(
    Boolean(auditCreateRes.data?.data?.createdById),
    'Created property is missing the createdById audit field',
  );
  pass('Property audit created');

  // 2. Update property -> updatedById audit field is populated.
  const auditUpdateRes = await client.patch(
    `/properties/${auditPropertyId}`,
    { status: 'SOLD' },
    { headers: adminHeaders },
  );
  assert(
    auditUpdateRes.status === 200,
    `Audit update failed: PATCH /properties/${auditPropertyId} -> HTTP ${auditUpdateRes.status}`,
  );
  assert(
    Boolean(auditUpdateRes.data?.data?.updatedById),
    'Updated property is missing the updatedById audit field',
  );
  pass('Property audit updated');

  // 3. Soft delete -> succeeds and the property disappears from normal reads.
  const softDeleteRes = await client.delete(`/properties/${auditPropertyId}`, {
    headers: adminHeaders,
  });
  assert(
    softDeleteRes.status === 200 || softDeleteRes.status === 204,
    `Soft delete failed: DELETE /properties/${auditPropertyId} -> HTTP ${softDeleteRes.status}`,
  );
  const getAfterDeleteRes = await client.get(`/properties/${auditPropertyId}`, {
    headers: adminHeaders,
  });
  assert(
    getAfterDeleteRes.status === 404,
    `Soft-deleted property should return 404 from a normal GET (got HTTP ${getAfterDeleteRes.status})`,
  );
  pass('Property soft delete verified');

  // 4. includeDeleted=true (admin) -> the soft-deleted property is returned.
  const includeDeletedUrl = '/properties?limit=100&includeDeleted=true';
  const includeDeletedRes = await client.get(includeDeletedUrl, { headers: adminHeaders });
  assert(
    includeDeletedRes.status === 200,
    `includeDeleted list failed: GET ${includeDeletedUrl} -> HTTP ${includeDeletedRes.status}`,
  );
  const deletedList: Array<{ id: string }> = includeDeletedRes.data?.data ?? [];
  assert(
    deletedList.some((p) => p.id === auditPropertyId),
    'includeDeleted=true did not return the soft-deleted property',
  );
  pass('Deleted records retrieval verified');

  // 5. Restore -> deletedAt becomes null and the property is readable again.
  const restoreRes = await client.patch(
    `/properties/${auditPropertyId}/restore`,
    {},
    { headers: adminHeaders },
  );
  assert(
    restoreRes.status === 200,
    `Restore failed: PATCH /properties/${auditPropertyId}/restore -> HTTP ${restoreRes.status} - ${JSON.stringify(
      restoreRes.data,
    )}`,
  );
  assert(
    restoreRes.data?.data?.deletedAt === null,
    'Restored property deletedAt is not null',
  );
  pass('Property restore verified');

  // Clean up the audit/restore property.
  await client.delete(`/properties/${auditPropertyId}`, { headers: adminHeaders });

  // 6. Transaction verification — Lead + LEAD_CREATED activity are atomic.
  const txLeadRes = await client.post('/leads', testLead, { headers: adminHeaders });
  assert(
    txLeadRes.status === 201 || txLeadRes.status === 200,
    `Transaction lead create failed: POST /leads -> HTTP ${txLeadRes.status} - ${JSON.stringify(
      txLeadRes.data,
    )}`,
  );
  const txLeadId: string | undefined = txLeadRes.data?.data?.id;
  assert(Boolean(txLeadId), 'Transaction lead create did not return an id');
  const leadActivitiesRes = await client.get(`/leads/${txLeadId}/activities`, {
    headers: adminHeaders,
  });
  assert(
    leadActivitiesRes.status === 200,
    `Get lead activities failed: HTTP ${leadActivitiesRes.status}`,
  );
  const leadActivities: Array<{ type?: string }> = leadActivitiesRes.data?.data ?? [];
  assert(
    leadActivities.some((a) => a.type === 'LEAD_CREATED'),
    'Lead creation did not atomically record a LEAD_CREATED activity',
  );
  pass('Lead transaction verified');

  // Visit + VISIT_CREATED activity are atomic (needs a client and a property).
  const txClientRes = await client.post('/clients', testClient, { headers: adminHeaders });
  const txClientId: string | undefined = txClientRes.data?.data?.id;
  assert(Boolean(txClientId), 'Transaction client create did not return an id');
  const txPropertyRes = await client.post('/properties', testProperty, { headers: adminHeaders });
  const txPropertyId: string | undefined = txPropertyRes.data?.data?.id;
  assert(Boolean(txPropertyId), 'Transaction property create did not return an id');

  const txVisitRes = await client.post(
    '/visits',
    {
      clientId: txClientId,
      propertyId: txPropertyId,
      leadId: txLeadId,
      visitDate: '2026-09-01T10:00:00.000Z',
      status: 'COMPLETED',
    },
    { headers: adminHeaders },
  );
  assert(
    txVisitRes.status === 201 || txVisitRes.status === 200,
    `Transaction visit create failed: POST /visits -> HTTP ${txVisitRes.status} - ${JSON.stringify(
      txVisitRes.data,
    )}`,
  );
  const txVisitId: string | undefined = txVisitRes.data?.data?.id;
  assert(Boolean(txVisitId), 'Transaction visit create did not return an id');
  const leadActivitiesAfterVisitRes = await client.get(`/leads/${txLeadId}/activities`, {
    headers: adminHeaders,
  });
  const leadActivitiesAfterVisit: Array<{ type?: string }> =
    leadActivitiesAfterVisitRes.data?.data ?? [];
  assert(
    leadActivitiesAfterVisit.some((a) => a.type === 'VISIT_CREATED'),
    'Visit creation did not atomically record a VISIT_CREATED activity',
  );
  pass('Visit transaction verified');

  // Clean up the transaction fixtures.
  await client.delete(`/visits/${txVisitId}`, { headers: adminHeaders });
  await client.delete(`/leads/${txLeadId}`, { headers: adminHeaders });
  await client.delete(`/clients/${txClientId}`, { headers: adminHeaders });
  await client.delete(`/properties/${txPropertyId}`, { headers: adminHeaders });

  // Section summary lines.
  pass('Audit fields verified');
  pass('Soft delete verified');
  pass('Restore verified');
  pass('Transaction verified');

  // ---------------------------------------------------------------------------
  // Security hardening verification: health endpoint, Helmet headers and the
  // per-route rate limiter. Run last so the rate-limit probe cannot interfere
  // with the earlier login/register steps.
  // ---------------------------------------------------------------------------

  // Health check: public endpoint reporting status, DB connectivity, uptime, version.
  const healthRes = await client.get('/health');
  assert(healthRes.status === 200, `Health check failed: HTTP ${healthRes.status}`);
  const health = (healthRes.data?.data ?? {}) as {
    status?: unknown;
    database?: unknown;
    uptime?: unknown;
    version?: unknown;
  };
  assert(health.status === 'ok', `Health status is not "ok" (got: ${String(health.status)})`);
  assert(health.database === 'up', `Health database is not "up" (got: ${String(health.database)})`);
  assert(typeof health.uptime === 'number', 'Health response is missing a numeric uptime');
  assert(
    typeof health.version === 'string' && health.version.length > 0,
    'Health response is missing a version',
  );
  pass('Health endpoint verified');

  // Helmet: security headers should be present on responses.
  const helmetHeaders = healthRes.headers as Record<string, string | undefined>;
  assert(
    helmetHeaders['x-content-type-options'] === 'nosniff',
    'Helmet header "x-content-type-options: nosniff" is missing',
  );
  assert(
    helmetHeaders['x-powered-by'] === undefined,
    'Helmet should remove the "x-powered-by" header',
  );
  pass('Security headers verified');

  // Password validation: the hardened RegisterDto rejects weak passwords with 400.
  // Register is rate-limited to 3/min (one real register was already used at
  // startup), so we probe a representative subset: "password" lacks an
  // uppercase/number/special char and "12345678" lacks letters and a special char.
  const weakPasswords = ['password', '12345678'];
  for (const weak of weakPasswords) {
    const weakRes = await client.post('/auth/register', {
      name: 'Weak Password User',
      email: `weak.${weak}@example.com`,
      password: weak,
    });
    assert(
      weakRes.status === 400,
      `Password validation failed for "${weak}": expected 400, got ${weakRes.status} - ${JSON.stringify(
        weakRes.data,
      )}`,
    );
  }
  pass('Password validation verified');

  // Rate limiting: exceeding the login limit (5/min) must yield HTTP 429.
  const loginAttempts: number[] = [];
  for (let i = 0; i < 8; i += 1) {
    const attempt = await client.post('/auth/login', {
      email: testUser.email,
      password: 'wrong-password',
    });
    loginAttempts.push(attempt.status);
  }
  assert(
    loginAttempts.includes(429),
    `Rate limiting did not trigger a 429 after repeated logins (statuses: ${loginAttempts.join(', ')})`,
  );
  pass('Rate limiting verified');

  console.log('\n\x1b[32mAll API tests passed!\x1b[0m');
}

run().catch((error: unknown) => {
  fail(describeError(error));
  console.error('\n\x1b[31mAPI tests failed.\x1b[0m');
  process.exit(1);
});
