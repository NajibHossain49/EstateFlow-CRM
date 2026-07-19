# EstateFlow CRM — Backend API

A production-quality backend API for a **Real Estate Property Management CRM**. It lets real estate
agencies manage **properties**, **clients**, and **users** with role-based access for **admins** and
**sales agents**.

Built with a clean, modular NestJS architecture suitable for a real SaaS product.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Installation](#installation)
- [Running with Docker (recommended)](#running-with-docker-recommended)
- [Running Locally (without Docker for the app)](#running-locally-without-docker-for-the-app)
- [Database Migrations & Seeding](#database-migrations--seeding)
- [API Documentation (Swagger)](#api-documentation-swagger)
- [API Reference](#api-reference)
- [Response Format](#response-format)
- [Testing the APIs](#testing-the-apis)
- [Available Scripts](#available-scripts)

---

## Overview

EstateFlow CRM is a REST API where agencies manage their real estate pipeline:

- **Admins** manage all properties, all clients, and all users.
- **Agents** create and manage the properties they own, and manage the clients they created.

Authentication is handled with **JWT** (via Passport), passwords are hashed with **bcrypt**, and
all input is validated with **class-validator**. Responses follow a single, consistent envelope.

---

## Features

- JWT authentication (register / login) with bcrypt password hashing
- Role-based authorization (`ADMIN`, `AGENT`) via a custom `@Roles()` decorator + guard
- `@CurrentUser()` decorator to access the authenticated user
- Properties CRUD with ownership rules (`createdBy` derived from the logged-in user)
- Clients CRUD with ownership rules
- Admin user management
- Global validation pipe (whitelist + reject unknown fields)
- Global exception filter with clean, consistent error responses
- Response-transform interceptor for a consistent success envelope
- Prisma ORM with PostgreSQL, migrations, and seed data
- Swagger / OpenAPI documentation
- Dockerfile + Docker Compose for one-command startup

---

## Tech Stack

| Concern            | Technology                          |
| ------------------ | ----------------------------------- |
| Framework          | NestJS 11                           |
| Language           | TypeScript                          |
| Database           | PostgreSQL 16                       |
| ORM                | Prisma 6                            |
| Auth               | JWT + Passport.js (`passport-jwt`)  |
| Validation         | class-validator / class-transformer |
| Password Hashing   | bcrypt                              |
| API Docs           | Swagger (`@nestjs/swagger`)         |
| Containerization   | Docker + Docker Compose             |
| Tooling            | ESLint + Prettier                   |

---

## Project Structure

```
src/
  auth/
    controllers/      auth.controller.ts        # POST /auth/register, /auth/login
    services/         auth.service.ts           # register + login logic
    dto/              register.dto.ts, login.dto.ts
    guards/           jwt-auth.guard.ts         # protects routes with JWT
    strategies/       jwt.strategy.ts           # validates the JWT & loads the user
    interfaces/       jwt-payload.interface.ts
    auth.module.ts

  users/
    controllers/      users.controller.ts       # admin user management + /users/me
    services/         users.service.ts
    dto/              create-user.dto.ts, update-user.dto.ts
    users.module.ts

  properties/
    controllers/      properties.controller.ts  # CRUD /properties
    services/         properties.service.ts
    dto/              create-property.dto.ts, update-property.dto.ts
    properties.module.ts

  clients/
    controllers/      clients.controller.ts     # CRUD /clients
    services/         clients.service.ts
    dto/              create-client.dto.ts, update-client.dto.ts
    clients.module.ts

  common/
    decorators/       current-user.decorator.ts, roles.decorator.ts, response-message.decorator.ts
    guards/           roles.guard.ts
    filters/          http-exception.filter.ts  # global exception handling
    interceptors/     transform.interceptor.ts  # consistent success envelope
    interfaces/       api-response.interface.ts, authenticated-user.interface.ts

  prisma/
    prisma.module.ts
    prisma.service.ts

  config/
    configuration.ts                            # typed config loader
    env.validation.ts                           # env var validation at boot

  app.module.ts
  main.ts                                       # bootstrap, global pipes/filters, Swagger

prisma/
  schema.prisma                                 # data model
  migrations/                                   # SQL migrations
  seed.ts                                       # seed data
```

---

## Prerequisites

- **Node.js** 20+ (tested on Node 22/24)
- **Docker** & **Docker Compose** (for PostgreSQL and/or the full stack)
- Or a local PostgreSQL 16 instance if you prefer not to use Docker for the DB

---

## Environment Setup

Copy the example env file and adjust as needed:

```bash
cp .env.example .env
```

| Variable          | Description                                        | Example                                                                       |
| ----------------- | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `NODE_ENV`        | Environment name                                   | `development`                                                                 |
| `PORT`            | Port the API listens on                            | `3000`                                                                        |
| `DATABASE_URL`    | PostgreSQL connection string used by the app/Prisma| `postgresql://estateflow:estateflow@localhost:5432/estateflow?schema=public`  |
| `POSTGRES_USER`   | Postgres user (docker-compose)                     | `estateflow`                                                                  |
| `POSTGRES_PASSWORD`| Postgres password (docker-compose)                | `estateflow`                                                                  |
| `POSTGRES_DB`     | Postgres database name (docker-compose)            | `estateflow`                                                                  |
| `JWT_SECRET`      | Secret used to sign JWTs (change in production!)   | `super-secret-change-me`                                                       |
| `JWT_EXPIRES_IN`  | Token lifetime                                     | `1d`                                                                          |

> When the API runs **inside** Docker Compose, its `DATABASE_URL` uses host `postgres` (the compose
> service name). When you run the API **on your host** against the Docker DB, the host is `localhost`.

---

## Installation

```bash
npm install
```

---

## Running with Docker (recommended)

This starts PostgreSQL **and** the API. On startup the API automatically applies migrations.

```bash
docker compose up --build
```

Then seed the database (one-time). The production image omits dev dependencies, so run the seed
from your host against the Dockerized Postgres (published on `localhost:5432`):

```bash
npm install          # if you haven't already
npm run prisma:seed
```

- API: http://localhost:3000/api
- Swagger: http://localhost:3000/api/docs

To only run the database in Docker:

```bash
docker compose up -d postgres
```

---

## Running Locally (without Docker for the app)

1. Start PostgreSQL (Docker or local install):

   ```bash
   docker compose up -d postgres
   ```

2. Apply migrations and seed:

   ```bash
   npm run prisma:migrate      # creates/updates the schema (dev)
   npm run prisma:seed         # inserts seed data
   ```

3. Start the API in watch mode:

   ```bash
   npm run start:dev
   ```

---

## Database Migrations & Seeding

| Command                    | Description                                             |
| -------------------------- | ------------------------------------------------------- |
| `npm run prisma:generate`  | Generate the Prisma client                              |
| `npm run prisma:migrate`   | Create & apply a migration in development               |
| `npm run prisma:deploy`    | Apply existing migrations (production/CI)               |
| `npm run prisma:seed`      | Seed the database with sample data                      |
| `npm run prisma:studio`    | Open Prisma Studio to browse data                       |

### Seed data

- **1 Admin** — `admin@estateflow.com`
- **2 Agents** — `agent1@estateflow.com`, `agent2@estateflow.com`
- **5 sample properties**
- **5 sample clients**

All seeded users share the password: **`Password123!`**

---

## API Documentation (Swagger)

Interactive OpenAPI docs are available once the app is running:

```
http://localhost:3000/api/docs
```

Use the **Authorize** button and paste your JWT (`Bearer <token>`) to try protected endpoints.

---

## API Reference

Base path: **`/api`**

### Auth

| Method | Endpoint         | Auth | Description                          |
| ------ | ---------------- | ---- | ------------------------------------ |
| POST   | `/auth/register` | —    | Register a new user                  |
| POST   | `/auth/login`    | —    | Login and receive a JWT access token |

### Properties

| Method | Endpoint          | Auth        | Description                                    |
| ------ | ----------------- | ----------- | ---------------------------------------------- |
| POST   | `/properties`     | JWT         | Create a property (owner = logged-in user)     |
| GET    | `/properties`     | JWT         | List all properties                            |
| GET    | `/properties/:id` | JWT         | Get a property by id                           |
| PATCH  | `/properties/:id` | JWT (owner/admin) | Update a property                        |
| DELETE | `/properties/:id` | JWT (owner/admin) | Delete a property                        |

### Clients

| Method | Endpoint        | Auth        | Description                                      |
| ------ | --------------- | ----------- | ------------------------------------------------ |
| POST   | `/clients`      | JWT         | Create a client (owner = logged-in user)         |
| GET    | `/clients`      | JWT         | List clients (admin: all, agent: own)            |
| GET    | `/clients/:id`  | JWT (owner/admin) | Get a client by id                         |
| PATCH  | `/clients/:id`  | JWT (owner/admin) | Update a client                            |
| DELETE | `/clients/:id`  | JWT (owner/admin) | Delete a client                            |

### Users (Admin)

| Method | Endpoint      | Auth         | Description                    |
| ------ | ------------- | ------------ | ------------------------------ |
| GET    | `/users/me`   | JWT          | Get the current user           |
| POST   | `/users`      | JWT + ADMIN  | Create a user                  |
| GET    | `/users`      | JWT + ADMIN  | List all users                 |
| GET    | `/users/:id`  | JWT + ADMIN  | Get a user by id               |
| PATCH  | `/users/:id`  | JWT + ADMIN  | Update a user                  |
| DELETE | `/users/:id`  | JWT + ADMIN  | Delete a user                  |

### Business rules

- Any authenticated user can **view** properties.
- Only authenticated users can **create** properties/clients.
- `createdBy` is always taken from the logged-in user — clients **cannot** send it (the payload is
  rejected if they do).
- Agents can only modify/delete the properties and clients they created; admins can manage all.

---

## Response Format

Every response uses a consistent envelope.

**Success**

```json
{
  "success": true,
  "message": "Property created successfully",
  "data": { }
}
```

**Error**

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": ["A valid email address is required"]
}
```

---

## Testing the APIs

### 1. Login to get a token

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@estateflow.com","password":"Password123!"}'
```

Copy the `data.accessToken` from the response.

### 2. Call a protected endpoint

```bash
TOKEN="<paste-access-token>"

curl http://localhost:3000/api/properties \
  -H "Authorization: Bearer $TOKEN"
```

### 3. Create a property

```bash
curl -X POST http://localhost:3000/api/properties \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Modern Downtown Apartment",
    "description": "Bright 2-bedroom apartment",
    "price": 320000,
    "location": "Downtown, New York",
    "bedrooms": 2,
    "bathrooms": 2,
    "area": 95,
    "propertyType": "APARTMENT"
  }'
```

You can also explore and test everything interactively via **Swagger** at `/api/docs`.

---

## Available Scripts

| Script                | Description                             |
| --------------------- | --------------------------------------- |
| `npm run start:dev`   | Start in watch mode                     |
| `npm run start:prod`  | Start the compiled app (`dist/main.js`) |
| `npm run build`       | Compile TypeScript to `dist`            |
| `npm run lint`        | Lint & auto-fix with ESLint             |
| `npm run format`      | Format with Prettier                    |
| `npm run prisma:*`    | Prisma helpers (see table above)        |

---

## License

UNLICENSED — internal/demo project.
