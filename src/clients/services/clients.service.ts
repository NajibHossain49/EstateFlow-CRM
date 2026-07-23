import { Injectable } from '@nestjs/common';
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
      data: { ...dto, createdBy: userId },
      include: clientInclude,
    });
  }

  /**
   * Lists clients with search, filtering, sorting and pagination.
   * Admins see all clients; agents see only the clients they created.
   */
  async findAll(query: QueryClientsDto, user: AuthenticatedUser): Promise<PaginatedResult<Client>> {
    const { page, limit, sortBy, sortOrder } = query;
    const where = this.buildWhere(query, user);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        include: clientInclude,
        orderBy: buildOrderBy(sortBy, sortOrder),
        skip: getSkip(page, limit),
        take: limit,
      }),
      this.prisma.client.count({ where }),
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
    const client = await this.prisma.client.findUnique({
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
    await this.findOne(id, user);

    return this.prisma.client.update({
      where: { id },
      data: dto,
      include: clientInclude,
    });
  }

  async remove(id: string, user: AuthenticatedUser): Promise<Client> {
    await this.findOne(id, user);

    return this.prisma.client.delete({
      where: { id },
      include: clientInclude,
    });
  }

  private assertCanManage(client: Client, user: AuthenticatedUser): void {
    if (user.role !== Role.ADMIN && client.createdBy !== user.id) {
      throw new ForbiddenActionException('You can only access clients you created');
    }
  }
}
