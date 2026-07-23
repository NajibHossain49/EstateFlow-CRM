import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { DEFAULT_RESPONSE_MESSAGE } from '../constants/app.constants';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';
import { isPaginatedResult } from '../pagination/pagination.util';
import { ApiSuccessResponse } from '../responses/api-response.interface';

/**
 * Wraps every successful controller response in a consistent envelope:
 * `{ success, message, data, meta }`.
 *
 * When a handler returns a `PaginatedResult` (`{ items, meta }`), the items are
 * placed in `data` and the pagination metadata is hoisted to `meta`. For all
 * other responses `meta` is `null`.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiSuccessResponse<unknown>> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessResponse<unknown>> {
    const message =
      this.reflector.getAllAndOverride<string>(RESPONSE_MESSAGE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? DEFAULT_RESPONSE_MESSAGE;

    return next.handle().pipe(
      map((payload): ApiSuccessResponse<unknown> => {
        if (isPaginatedResult(payload)) {
          return { success: true, message, data: payload.items, meta: payload.meta };
        }
        return { success: true, message, data: payload ?? null, meta: null };
      }),
    );
  }
}
