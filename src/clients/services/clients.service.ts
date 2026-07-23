import { BadRequestException, Injectable } from '@nestjs/common';
import { Client, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  PaginatedResult,
  buildPaginationMeta,
  getSkip,
} from '../../common/pagination/pagination.util';
import { buildOrderBy } from '../../common/sorting/sorting.util';
import {
  caseInsensitiveContains,
  numericRange,
  searchAcross,
} from '../../common/filters/filter.util';
import { withDeleted } from '../../common/prisma/soft-delete';
import { ForbiddenActionException } from '../../common/exceptions/forbidden-action.exception';
import { ResourceNotFoundException } from '../../common/exceptions/resource-not-found.exception';
import { CreateClientDto } from '../dto/create-client.dto';
import { QueryClientsDto } from '../dto/query-clients.dto';
import { UpdateClientDto } from '../dto/update-client.dto';

const clientInclude = {
  creator: { select: { id: true, name: true, email: true, role: true } },
} satisfies Prisma.ClientInclude;

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a client owned by the current user. createdBy is always derived
   * from the authenticated user and never accepted from the client.
   */
  create(dto: CreateClientDto, userId: string): Promise<Client> {
    return this.prisma.client.create({
      data: { ...dto, createdBy: userId, createdById: userId },
      include: clientInclude,
    });
  }

  /**
   * Lists clients with search, filtering, sorting and pagination.
   * Admins see all clients; agents see only the clients they created.
   * Admins may pass includeDeleted=true to also see soft-deleted clients.
   */
  async findAll(query: QueryClientsDto, user: AuthenticatedUser): Promise<PaginatedResult<Client>> {
    const { page, limit, sortBy, sortOrder } = query;
    const where = this.buildWhere(query, user);
    const includeDeleted = user.role === Role.ADMIN && query.includeDeleted === true;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.client.findMany(
        withDeleted(
          {
            where,
            include: clientInclude,
            orderBy: buildOrderBy(sortBy, sortOrder),
            skip: getSkip(page, limit),
            take: limit,
          },
          includeDeleted,
        ),
      ),
      this.prisma.client.count(withDeleted({ where }, includeDeleted)),
    ]);

    return { items, meta: buildPaginationMeta(page, limit, total) };
  }

  /** Builds the Prisma filter dynamically, ignoring undefined query params. */
  private buildWhere(query: QueryClientsDto, user: AuthenticatedUser): Prisma.ClientWhereInput {
    const { search, preferredLocation, minBudget, maxBudget } = query;
    const where: Prisma.ClientWhereInput = {};

    where.preferredLocation = caseInsensitiveContains(preferredLocation);
    where.budget = numericRange(minBudget, maxBudget);
    where.OR = searchAcross<Prisma.ClientWhereInput>(
      ['name', 'phone', 'email', 'preferredLocation'],
      search,
    );

    // Ownership scope wins: agents only ever see their own clients.
    if (user.role !== Role.ADMIN) {
      where.createdBy = user.id;
    }

    return where;
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<Client> {
    const client = await this.prisma.client.findFirst({
      where: { id },
      include: clientInclude,
    });

    if (!client) {
      throw new ResourceNotFoundException('Client', id);
    }

    this.assertCanManage(client, user);
    return client;
  }

  async update(id: string, dto: UpdateClientDto, user: AuthenticatedUser): Promise<Client> {
    await this.assertCanManageById(id, user);

    return this.prisma.client.update({
      where: { id },
      data: { ...dto, updatedById: user.id },
      include: clientInclude,
    });
  }

  /** Soft delete: stamps deletedAt / deletedById instead of removing the row. */
  async remove(id: string, user: AuthenticatedUser): Promise<Client> {
    await this.assertCanManageById(id, user);

    return this.prisma.client.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: user.id },
      include: clientInclude,
    });
  }

  /** Restores a soft-deleted client (owner or admin). */
  async restore(id: string, user: AuthenticatedUser): Promise<Client> {
    const client = await this.prisma.client.findFirst(
      withDeleted({ where: { id }, include: clientInclude }, true),
    );

    if (!client) {
      throw new ResourceNotFoundException('Client', id);
    }
    this.assertCanManage(client, user);
    if (!client.deletedAt) {
      throw new BadRequestException('Client is not deleted');
    }

    return this.prisma.client.update({
      where: { id },
      data: { deletedAt: null, deletedById: null, updatedById: user.id },
      include: clientInclude,
    });
  }

  /** Lightweight ownership check for write paths (selects only the owner column). */
  private async assertCanManageById(id: string, user: AuthenticatedUser): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id },
      select: { createdBy: true },
    });
    if (!client) {
      throw new ResourceNotFoundException('Client', id);
    }
    this.assertCanManage(client, user);
  }

  private assertCanManage(client: Pick<Client, 'createdBy'>, user: AuthenticatedUser): void {
    if (user.role !== Role.ADMIN && client.createdBy !== user.id) {
      throw new ForbiddenActionException('You can only access clients you created');
    }
  }
}
