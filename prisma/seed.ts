import { PrismaClient, Role, PropertyType, PropertyStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const passwordHash = await bcrypt.hash('Password123!', 10);

  // 1 Admin + 2 Agents
  const admin = await prisma.user.upsert({
    where: { email: 'admin@estateflow.com' },
    update: {},
    create: {
      name: 'System Admin',
      email: 'admin@estateflow.com',
      password: passwordHash,
      role: Role.ADMIN,
    },
  });

  const agentOne = await prisma.user.upsert({
    where: { email: 'agent1@estateflow.com' },
    update: {},
    create: {
      name: 'Alice Agent',
      email: 'agent1@estateflow.com',
      password: passwordHash,
      role: Role.AGENT,
    },
  });

  const agentTwo = await prisma.user.upsert({
    where: { email: 'agent2@estateflow.com' },
    update: {},
    create: {
      name: 'Bob Agent',
      email: 'agent2@estateflow.com',
      password: passwordHash,
      role: Role.AGENT,
    },
  });

  // Reset domain data so seeding is idempotent
  await prisma.property.deleteMany();
  await prisma.client.deleteMany();

  // 5 Sample properties
  await prisma.property.createMany({
    data: [
      {
        title: 'Modern Downtown Apartment',
        description: 'A bright 2-bedroom apartment in the heart of the city with skyline views.',
        price: 320000,
        location: 'Downtown, New York',
        bedrooms: 2,
        bathrooms: 2,
        area: 95,
        propertyType: PropertyType.APARTMENT,
        status: PropertyStatus.AVAILABLE,
        createdBy: agentOne.id,
      },
      {
        title: 'Suburban Family House',
        description: 'Spacious 4-bedroom family home with a large backyard and garage.',
        price: 550000,
        location: 'Greenwood, Seattle',
        bedrooms: 4,
        bathrooms: 3,
        area: 220,
        propertyType: PropertyType.HOUSE,
        status: PropertyStatus.AVAILABLE,
        createdBy: agentOne.id,
      },
      {
        title: 'Commercial Office Space',
        description: 'Open-plan office space suitable for up to 40 employees, prime location.',
        price: 980000,
        location: 'Financial District, Chicago',
        bedrooms: 0,
        bathrooms: 4,
        area: 600,
        propertyType: PropertyType.COMMERCIAL,
        status: PropertyStatus.RENTED,
        createdBy: agentTwo.id,
      },
      {
        title: 'Beachfront Land Plot',
        description: 'Rare beachfront plot ready for development, all permits available.',
        price: 1250000,
        location: 'Malibu, California',
        bedrooms: 0,
        bathrooms: 0,
        area: 1200,
        propertyType: PropertyType.LAND,
        status: PropertyStatus.AVAILABLE,
        createdBy: agentTwo.id,
      },
      {
        title: 'Cozy Studio Apartment',
        description: 'Fully furnished studio ideal for students or young professionals.',
        price: 180000,
        location: 'Midtown, Austin',
        bedrooms: 1,
        bathrooms: 1,
        area: 45,
        propertyType: PropertyType.APARTMENT,
        status: PropertyStatus.SOLD,
        createdBy: admin.id,
      },
    ],
  });

  // 5 Sample clients
  await prisma.client.createMany({
    data: [
      {
        name: 'John Carter',
        phone: '+1-202-555-0143',
        email: 'john.carter@example.com',
        budget: 400000,
        preferredLocation: 'Downtown, New York',
        createdBy: agentOne.id,
      },
      {
        name: 'Emma Wilson',
        phone: '+1-206-555-0178',
        email: 'emma.wilson@example.com',
        budget: 600000,
        preferredLocation: 'Greenwood, Seattle',
        createdBy: agentOne.id,
      },
      {
        name: 'Michael Brown',
        phone: '+1-312-555-0199',
        email: null,
        budget: 1000000,
        preferredLocation: 'Financial District, Chicago',
        createdBy: agentTwo.id,
      },
      {
        name: 'Sophia Davis',
        phone: '+1-310-555-0122',
        email: 'sophia.davis@example.com',
        budget: 1500000,
        preferredLocation: 'Malibu, California',
        createdBy: agentTwo.id,
      },
      {
        name: 'Liam Martinez',
        phone: '+1-512-555-0165',
        email: 'liam.martinez@example.com',
        budget: 200000,
        preferredLocation: 'Midtown, Austin',
        createdBy: admin.id,
      },
    ],
  });

  console.log('Seeding complete.');
  console.log('Login credentials (all users): password = "Password123!"');
  console.log('  Admin:  admin@estateflow.com');
  console.log('  Agent1: agent1@estateflow.com');
  console.log('  Agent2: agent2@estateflow.com');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
