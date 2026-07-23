import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

/**
 * Structured HTTP request logger. Emits one line per request containing the
 * method, URL, status code and duration, at a level derived from the status:
 * 5xx -> ERROR, 4xx -> WARN, otherwise INFO. A DEBUG line marks request start
 * (visible only when debug logging is enabled, e.g. outside production).
 *
 * Registered as the outermost global interceptor so the measured duration
 * covers the full handler pipeline.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const method = request.method;
    const url = request.originalUrl;
    const startedAt = Date.now();

    this.logger.debug(`--> ${method} ${url}`);

    return next.handle().pipe(
      tap(() => this.log(method, url, response.statusCode, Date.now() - startedAt)),
      catchError((error: unknown) => {
        const statusCode =
          error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
        this.log(method, url, statusCode, Date.now() - startedAt);
        return throwError(() => error);
      }),
    );
  }

  private log(method: string, url: string, statusCode: number, durationMs: number): void {
    const entry = JSON.stringify({ method, url, statusCode, durationMs });

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(entry);
    } else if (statusCode >= HttpStatus.BAD_REQUEST) {
      this.logger.warn(entry);
    } else {
      this.logger.log(entry);
    }
  }
}
