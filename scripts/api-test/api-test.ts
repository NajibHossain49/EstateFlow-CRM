import axios, { AxiosError, AxiosInstance } from 'axios';

/**
 * Automated API smoke test for the EstateFlow CRM backend.
 *
 * Runs the full happy-path flow (register -> login -> properties -> clients -> leads ->
 * visits -> activity timeline) against a running instance and exits non-zero if any step fails.
 *
 * Configure the target with the API_URL env var (default: http://localhost:3000).
 * The NestJS app is served under the global "/api" prefix, which is appended here.
 */

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const BASE_URL = `${API_URL.replace(/\/+$/, '')}/api`;

const testUser = {
  name: 'Test Admin',
  email: 'testadmin@example.com',
  password: 'password123',
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

  // 4. Get all properties and verify the created one is present
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

  // 7. Get clients and verify the created one is present
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
  const leads: Array<{ id: string }> = listLeadRes.data?.data?.items ?? [];
  assert(Array.isArray(leads), 'Leads response did not contain an items array');
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
  const filteredLeads: Array<{ id: string; status: string }> =
    filterLeadRes.data?.data?.items ?? [];
  assert(Array.isArray(filteredLeads), 'Filtered leads response did not contain an items array');
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

  // 15. Get all visits and verify the created one is present (paginated: data.items).
  const listVisitRes = await client.get('/visits', { headers: authHeaders });
  assert(
    listVisitRes.status === 200,
    `Get visits failed: GET /visits -> HTTP ${listVisitRes.status} - ${JSON.stringify(
      listVisitRes.data,
    )}`,
  );
  const visits: Array<{ id: string }> = listVisitRes.data?.data?.items ?? [];
  assert(Array.isArray(visits), 'Visits response did not contain an items array');
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
  const filteredVisits: Array<{ id: string; status: string }> =
    filterVisitRes.data?.data?.items ?? [];
  assert(Array.isArray(filteredVisits), 'Filtered visits response did not contain an items array');
  assert(
    filteredVisits.some((v) => v.id === visitId),
    'Updated visit was not found when filtering by status=COMPLETED',
  );
  assert(
    filteredVisits.every((v) => v.status === 'COMPLETED'),
    'Status filter returned visits with a different status',
  );
  pass('Visit filtering successful');

  // 19. Delete visit
  const deleteVisitRes = await client.delete(`/visits/${visitId}`, { headers: authHeaders });
  assert(
    deleteVisitRes.status === 200 || deleteVisitRes.status === 204,
    `Delete visit failed: DELETE /visits/${visitId} -> HTTP ${deleteVisitRes.status} - ${JSON.stringify(
      deleteVisitRes.data,
    )}`,
  );
  pass('Visit deleted');

  // 20. Delete lead (done last so it survives the activity-timeline checks above)
  const deleteLeadRes = await client.delete(`/leads/${leadId}`, { headers: authHeaders });
  assert(
    deleteLeadRes.status === 200 || deleteLeadRes.status === 204,
    `Delete lead failed: DELETE /leads/${leadId} -> HTTP ${deleteLeadRes.status} - ${JSON.stringify(
      deleteLeadRes.data,
    )}`,
  );
  pass('Lead deleted');

  console.log('\n\x1b[32mAll API tests passed!\x1b[0m');
}

run().catch((error: unknown) => {
  fail(describeError(error));
  console.error('\n\x1b[31mAPI tests failed.\x1b[0m');
  process.exit(1);
});
