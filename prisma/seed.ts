import {
  ActivityType,
  LeadStatus,
  Prisma,
  PrismaClient,
  PropertyStatus,
  PropertyType,
  Role,
  VisitStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Dataset sizes
// ---------------------------------------------------------------------------
const PROPERTY_COUNT = 100;
const CLIENT_COUNT = 200;
const LEAD_COUNT = 500;
const VISIT_COUNT = 100;

// ---------------------------------------------------------------------------
// Deterministic-ish random helpers (no external dependency)
// ---------------------------------------------------------------------------
const randomInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const pick = <T>(items: readonly T[]): T => items[randomInt(0, items.length - 1)];

const chance = (probability: number): boolean => Math.random() < probability;

/** Returns a date offset from now by the given number of days (may be negative). */
const dateOffset = (days: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(randomInt(8, 18), randomInt(0, 59), 0, 0);
  return date;
};

// ---------------------------------------------------------------------------
// Sample data pools
// ---------------------------------------------------------------------------
const FIRST_NAMES = [
  'John', 'Emma', 'Michael', 'Sophia', 'Liam', 'Olivia', 'Noah', 'Ava', 'James', 'Isabella',
  'William', 'Mia', 'Benjamin', 'Charlotte', 'Lucas', 'Amelia', 'Henry', 'Harper', 'Alexander', 'Evelyn',
  'Daniel', 'Abigail', 'Matthew', 'Emily', 'David', 'Elizabeth', 'Joseph', 'Sofia', 'Samuel', 'Grace',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Martinez', 'Wilson',
  'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White',
];

const CITIES = [
  'Downtown, New York', 'Greenwood, Seattle', 'Financial District, Chicago', 'Malibu, California',
  'Midtown, Austin', 'Brooklyn, New York', 'Capitol Hill, Denver', 'South Beach, Miami',
  'Beacon Hill, Boston', 'River North, Chicago', 'Pearl District, Portland', 'Highlands, Atlanta',
];

const PROPERTY_ADJECTIVES = [
  'Modern', 'Spacious', 'Cozy', 'Luxurious', 'Charming', 'Elegant', 'Renovated', 'Bright',
  'Contemporary', 'Sunlit', 'Stylish', 'Premium',
];

const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  [PropertyType.HOUSE]: 'House',
  [PropertyType.APARTMENT]: 'Apartment',
  [PropertyType.LAND]: 'Land Plot',
  [PropertyType.COMMERCIAL]: 'Commercial Space',
};

const LEAD_SOURCES = ['FACEBOOK', 'GOOGLE', 'REFERRAL', 'WALK_IN', 'WEBSITE', 'INSTAGRAM', 'ZILLOW'];

const PROPERTY_TYPES = Object.values(PropertyType);
const PROPERTY_STATUSES = Object.values(PropertyStatus);
const LEAD_STATUSES = Object.values(LeadStatus);
const VISIT_STATUSES = Object.values(VisitStatus);

const fullName = (): string => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;

const emailFrom = (name: string, index: number): string =>
  `${name.toLowerCase().replace(/[^a-z]+/g, '.')}.${index}@example.com`;

const phone = (): string =>
  `+1-${randomInt(200, 989)}-555-${randomInt(1000, 9999).toString().padStart(4, '0')}`;

async function main(): Promise<void> {
  console.log('Seeding EstateFlow CRM database...');

  const passwordHash = await bcrypt.hash('Password123!', 10);

  // -------------------------------------------------------------------------
  // Users: 1 Admin, 1 Manager, 2 Agents
  // -------------------------------------------------------------------------
  const userSeeds: Array<{ name: string; email: string; role: Role }> = [
    { name: 'System Admin', email: 'admin@estateflow.com', role: Role.ADMIN },
    { name: 'Morgan Manager', email: 'manager@estateflow.com', role: Role.MANAGER },
    { name: 'Alice Agent', email: 'agent1@estateflow.com', role: Role.AGENT },
    { name: 'Bob Agent', email: 'agent2@estateflow.com', role: Role.AGENT },
  ];

  const users = await Promise.all(
    userSeeds.map((user) =>
      prisma.user.upsert({
        where: { email: user.email },
        update: { name: user.name, role: user.role },
        create: { ...user, password: passwordHash },
      }),
    ),
  );

  const userIds = users.map((user) => user.id);
  // Agents + manager act as record owners / assigned agents.
  const ownerIds = users
    .filter((user) => user.role !== Role.ADMIN)
    .map((user) => user.id);
  const ownerOrAdminIds = userIds;

  // -------------------------------------------------------------------------
  // Reset domain data so seeding is idempotent (respect FK order).
  // -------------------------------------------------------------------------
  await prisma.activity.deleteMany();
  await prisma.visit.deleteMany();
  await prisma.media.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.client.deleteMany();
  await prisma.property.deleteMany();

  // -------------------------------------------------------------------------
  // Properties
  // -------------------------------------------------------------------------
  const propertyData: Prisma.PropertyCreateManyInput[] = Array.from(
    { length: PROPERTY_COUNT },
    () => {
      const type = pick(PROPERTY_TYPES);
      const city = pick(CITIES);
      const owner = pick(ownerOrAdminIds);
      const isLand = type === PropertyType.LAND;
      return {
        title: `${pick(PROPERTY_ADJECTIVES)} ${PROPERTY_TYPE_LABEL[type]} in ${city.split(',')[0]}`,
        description: `A ${PROPERTY_TYPE_LABEL[type].toLowerCase()} located in ${city}. Great investment opportunity with excellent connectivity and amenities.`,
        price: new Prisma.Decimal(randomInt(80_000, 2_500_000)),
        location: city,
        bedrooms: isLand ? 0 : randomInt(1, 6),
        bathrooms: isLand ? 0 : randomInt(1, 5),
        area: randomInt(40, 1500),
        propertyType: type,
        status: pick(PROPERTY_STATUSES),
        createdBy: owner,
        createdById: owner,
      };
    },
  );
  await prisma.property.createMany({ data: propertyData });

  // -------------------------------------------------------------------------
  // Clients
  // -------------------------------------------------------------------------
  const clientData: Prisma.ClientCreateManyInput[] = Array.from(
    { length: CLIENT_COUNT },
    (_, index) => {
      const name = fullName();
      const owner = pick(ownerOrAdminIds);
      return {
        name,
        phone: phone(),
        email: chance(0.85) ? emailFrom(name, index) : null,
        budget: new Prisma.Decimal(randomInt(100_000, 2_000_000)),
        preferredLocation: pick(CITIES),
        createdBy: owner,
        createdById: owner,
      };
    },
  );
  await prisma.client.createMany({ data: clientData });

  // -------------------------------------------------------------------------
  // Leads
  // -------------------------------------------------------------------------
  const leadData: Prisma.LeadCreateManyInput[] = Array.from({ length: LEAD_COUNT }, (_, index) => {
    const name = fullName();
    const agent = pick(ownerIds);
    return {
      name,
      phone: phone(),
      email: chance(0.7) ? emailFrom(name, index) : null,
      source: pick(LEAD_SOURCES),
      status: pick(LEAD_STATUSES),
      notes: chance(0.5) ? 'Interested in a property, follow up scheduled.' : null,
      assignedAgentId: agent,
      createdById: agent,
    };
  });
  await prisma.lead.createMany({ data: leadData });

  // -------------------------------------------------------------------------
  // Fetch generated ids for relational records
  // -------------------------------------------------------------------------
  const [propertyIds, clientIds, leads] = await Promise.all([
    prisma.property.findMany({ select: { id: true } }),
    prisma.client.findMany({ select: { id: true } }),
    prisma.lead.findMany({ select: { id: true, assignedAgentId: true } }),
  ]);

  // -------------------------------------------------------------------------
  // Activities: a LEAD_CREATED entry per lead for a realistic timeline
  // -------------------------------------------------------------------------
  const activityData: Prisma.ActivityCreateManyInput[] = leads.map((lead) => ({
    type: ActivityType.LEAD_CREATED,
    description: 'Lead created',
    leadId: lead.id,
    createdBy: lead.assignedAgentId,
    createdById: lead.assignedAgentId,
  }));
  await prisma.activity.createMany({ data: activityData });

  // -------------------------------------------------------------------------
  // Visits (link ~half to a lead)
  // -------------------------------------------------------------------------
  const visitData: Prisma.VisitCreateManyInput[] = Array.from({ length: VISIT_COUNT }, () => {
    const status = pick(VISIT_STATUSES);
    const agent = pick(ownerIds);
    return {
      clientId: pick(clientIds).id,
      propertyId: pick(propertyIds).id,
      agentId: agent,
      leadId: chance(0.5) ? pick(leads).id : null,
      visitDate: dateOffset(randomInt(-30, 30)),
      status,
      notes: chance(0.4) ? 'Client walkthrough scheduled.' : null,
      createdById: agent,
    };
  });
  await prisma.visit.createMany({ data: visitData });

  console.log('Seeding complete.');
  console.log(
    `Created ${PROPERTY_COUNT} properties, ${CLIENT_COUNT} clients, ${LEAD_COUNT} leads, ${VISIT_COUNT} visits.`,
  );
  console.log('Login credentials (all users): password = "Password123!"');
  console.log('  Admin:   admin@estateflow.com');
  console.log('  Manager: manager@estateflow.com');
  console.log('  Agent1:  agent1@estateflow.com');
  console.log('  Agent2:  agent2@estateflow.com');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
