import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { API_GLOBAL_PREFIX, SWAGGER_PATH } from './common/constants/app.constants';
import { JSON_BODY_LIMIT } from './common/constants/security.constants';
import { AllExceptionsFilter } from './common/exceptions/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap(): Promise<void> {
  // Disable Nest's default body parser so we can enforce our own size limits.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const configService = app.get(ConfigService);

  app.setGlobalPrefix(API_GLOBAL_PREFIX);

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

  // Consistent success/error envelopes across the whole API.
  app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('EstateFlow CRM API')
    .setDescription('Real Estate Property Management CRM backend API')
    .setVersion(configService.get<string>('version') ?? '1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${API_GLOBAL_PREFIX}/${SWAGGER_PATH}`, app, document);

  const port = configService.get<number>('port') ?? 3000;
  await app.listen(port);

  console.log(`EstateFlow CRM API running on http://localhost:${port}/${API_GLOBAL_PREFIX}`);
  console.log(
    `Swagger docs available at http://localhost:${port}/${API_GLOBAL_PREFIX}/${SWAGGER_PATH}`,
  );
}

void bootstrap();
