import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { ApiErrorResponse } from '../responses/api-response.interface';

/**
 * Global exception filter. Normalizes every thrown error into the standard
 * error envelope: { success: false, message, errors }.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: unknown[] = [];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const res = exceptionResponse as Record<string, unknown>;
        const resMessage = res.message;

        if (Array.isArray(resMessage)) {
          // class-validator produces an array of messages
          message = 'Validation failed';
          errors = resMessage;
        } else if (typeof resMessage === 'string') {
          message = resMessage;
        }
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = this.mapPrismaError(exception);
      status = mapped.status;
      message = mapped.message;
    } else if (this.isMulterError(exception)) {
      const mapped = this.mapMulterError(exception);
      status = mapped.status;
      message = mapped.message;
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ApiErrorResponse = {
      success: false,
      message,
      errors,
    };

    response.status(status).json(body);
  }

  /** Multer signals upload problems via an Error subclass named "MulterError". */
  private isMulterError(exception: unknown): exception is Error & { code?: string } {
    return exception instanceof Error && exception.name === 'MulterError';
  }

  private mapMulterError(error: Error & { code?: string }): { status: number; message: string } {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return {
          status: HttpStatus.PAYLOAD_TOO_LARGE,
          message: 'File too large (maximum 10 MB per file)',
        };
      case 'LIMIT_FILE_COUNT':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Too many files (maximum 10 per upload)',
        };
      case 'LIMIT_UNEXPECTED_FILE':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Unexpected file field',
        };
      default:
        return { status: HttpStatus.BAD_REQUEST, message: error.message };
    }
  }

  private mapPrismaError(error: Prisma.PrismaClientKnownRequestError): {
    status: number;
    message: string;
  } {
    switch (error.code) {
      case 'P2002': {
        const target = (error.meta?.target as string[] | undefined)?.join(', ');
        return {
          status: HttpStatus.CONFLICT,
          message: target
            ? `A record with this ${target} already exists`
            : 'Unique constraint violation',
        };
      }
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'The requested record was not found',
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Related record does not exist',
        };
      default:
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Database request error',
        };
    }
  }
}
