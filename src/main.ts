import { Logger, LogLevel, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { API_GLOBAL_PREFIX, API_VERSION, SWAGGER_PATH } from './common/constants/app.constants';
import { JSON_BODY_LIMIT } from './common/constants/security.constants';
import { AllExceptionsFilter } from './common/exceptions/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

/** Long-form API description rendered at the top of the Swagger UI. */
const API_DESCRIPTION = [
  'Production backend for **EstateFlow CRM**, a Real Estate Property Management platform.',
  '',
  '### Authentication',
  'All endpoints require a Bearer JWT except `POST /auth/register`, `POST /auth/login` and `GET /health`.',
  'Obtain a token via login, then click **Authorize** and paste the `accessToken`.',
  '',
  '### Versioning',
  'The API is URI-versioned. Every route is served under `/api/v1`. Future breaking changes',
  'will be introduced as `/api/v2` while `v1` continues to operate unchanged.',
  '',
  '### Response envelope',
  'Successful responses share a consistent shape:',
  '```json',
  '{ "success": true, "message": "Request successful", "data": {}, "meta": null }',
  '```',
  'List endpoints return the collection in `data` and pagination details in `meta`',
  '(`page`, `limit`, `total`, `totalPages`, `hasNextPage`, `hasPreviousPage`).',
  '',
  '### Errors',
  'Errors share the shape `{ "success": false, "message": "...", "errors": [] }` with an',
  'appropriate HTTP status (400 validation, 401 unauthorized, 403 forbidden, 404 not found,',
  '409 conflict, 413 payload too large, 429 too many requests).',
].join('\n');

/** Tag descriptions grouping the endpoints in the Swagger UI. */
const API_TAGS: ReadonlyArray<[name: string, description: string]> = [
  ['Auth', 'Registration, login and JWT issuance.'],
  ['Users', 'User profile and account management.'],
  ['Properties', 'Property listings CRUD, search, filtering and soft delete/restore.'],
  ['Clients', 'Client records CRUD, search and filtering.'],
  ['Leads', 'Sales lead pipeline with status tracking and activity timeline.'],
  ['Visits', 'Property visit scheduling and lifecycle management.'],
  ['Activities', 'Automatically generated audit/activity timeline for leads.'],
  ['Dashboard', 'Aggregated analytics: overview, pipeline, distribution and summaries.'],
  ['Reports', 'Sales, lead, agent, property and visit reports with CSV export.'],
  ['Media', 'Image uploads (Cloudinary) and attachment/ordering for properties.'],
  ['Health', 'Liveness/readiness probe with database connectivity and latency.'],
];

async function bootstrap(): Promise<void> {
  // Disable Nest's default body parser so we can enforce our own size limits.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const configService = app.get(ConfigService);

  // Structured logging: suppress verbose/debug output in production.
  const isProduction = configService.get<string>('nodeEnv') === 'production';
  const logLevels: LogLevel[] = isProduction
    ? ['error', 'warn', 'log']
    : ['error', 'warn', 'log', 'debug', 'verbose'];
  app.useLogger(logLevels);

  app.setGlobalPrefix(API_GLOBAL_PREFIX);

  // URI versioning -> routes served under /api/v1/... with v1 as the default.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: API_VERSION });

  // Security headers (CSP, HSTS, X-Frame-Options, etc.).
  app.use(helmet());

  // Gzip/deflate response compression to reduce payload size.
  app.use(compression());

  // Enforce request body size limits (JSON + urlencoded).
  app.use(json({ limit: JSON_BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));

  // CORS driven by env: "*" (default) reflects any origin, otherwise a
  // comma-separated allow-list.
  const corsOrigin = configService.get<string>('corsOrigin') ?? '*';
  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Validation: strip unknown props, reject extras, and auto-transform payloads.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // LoggingInterceptor is outermost so it measures the full pipeline duration;
  // TransformInterceptor wraps responses in the consistent envelope.
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new AllExceptionsFilter());

  const versionedBasePath = `/${API_GLOBAL_PREFIX}/v${API_VERSION}`;
  const swaggerBuilder = new DocumentBuilder()
    .setTitle('EstateFlow CRM API')
    .setDescription(API_DESCRIPTION)
    .setVersion(configService.get<string>('version') ?? '1.0.0')
    .setContact(
      'EstateFlow Engineering',
      'https://estateflow.example.com',
      'api@estateflow.example.com',
    )
    .setLicense('UNLICENSED', 'https://estateflow.example.com/license')
    // Swagger paths already include the full `/api/v1` prefix (global prefix +
    // URI version), so no explicit server is added to avoid duplicating it.
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' });
  for (const [name, description] of API_TAGS) {
    swaggerBuilder.addTag(name, description);
  }
  const document = SwaggerModule.createDocument(app, swaggerBuilder.build());
  SwaggerModule.setup(`${API_GLOBAL_PREFIX}/${SWAGGER_PATH}`, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const logger = new Logger('Bootstrap');
  const port = configService.get<number>('port') ?? 3000;
  await app.listen(port);

  logger.log(`EstateFlow CRM API running on http://localhost:${port}${versionedBasePath}`);
  logger.log(
    `Swagger docs available at http://localhost:${port}/${API_GLOBAL_PREFIX}/${SWAGGER_PATH}`,
  );
}

void bootstrap();
