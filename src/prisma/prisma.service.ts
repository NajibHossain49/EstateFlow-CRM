import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { INCLUDE_DELETED_ARG, SOFT_DELETE_MODELS } from '../common/prisma/soft-delete';

/**
 * Operations whose `where` clause is transparently scoped to non-deleted rows.
 * `findUnique(OrThrow)` is intentionally excluded: its `where` only accepts
 * unique fields, so the services use `findFirst` for id lookups instead, which
 * this extension can safely filter.
 */
const FILTERED_OPERATIONS = new Set<string>([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
]);

/**
 * Builds the soft-delete query extension. For soft-deletable models it appends
 * `deletedAt: null` to reads/bulk writes so deleted rows are invisible to normal
 * queries. Callers opt in to deleted rows by tagging args via {@link withDeleted};
 * the marker is stripped here so it never reaches the query engine. Actual
 * deletion is a service-level `update` that stamps `deletedAt` / `deletedById`
 * (the extension has no user context), so there is no delete -> update rewrite.
 */
function softDeleteExtension(client: PrismaClient): PrismaClient {
  return client.$extends({
    name: 'softDelete',
    query: {
      $allModels: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        $allOperations({ model, operation, args, query }: any) {
          if (!model || !SOFT_DELETE_MODELS.has(model as Prisma.ModelName)) {
            return query(args);
          }

          const nextArgs = (args ?? {}) as Record<string, unknown>;
          const includeDeleted = nextArgs[INCLUDE_DELETED_ARG] === true;
          if (INCLUDE_DELETED_ARG in nextArgs) {
            delete nextArgs[INCLUDE_DELETED_ARG];
          }

          if (!includeDeleted && FILTERED_OPERATIONS.has(operation)) {
            nextArgs.where = {
              ...(nextArgs.where as object | undefined),
              deletedAt: null,
            };
          }

          return query(nextArgs);
        },
      },
    },
  }) as unknown as PrismaClient;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super();
    // A query extension preserves the delegate types, so the extended client is
    // structurally identical to PrismaClient and safe to expose as PrismaService.
    return softDeleteExtension(this) as unknown as PrismaService;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
