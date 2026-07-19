import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, Visit } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CreateVisitDto } from '../dto/create-visit.dto';
import { QueryVisitsDto } from '../dto/query-visits.dto';
import { UpdateVisitDto } from '../dto/update-visit.dto';

const visitInclude = {
  client: { select: { id: true, name: true, phone: true, email: true } },
  property: { select: { id: true, title: true, location: true, price: true, status: true } },
  agent: { select: { id: true, name: true, email: true, role: true } },
} satisfies Prisma.VisitInclude;

export interface PaginatedVisits {
  items: Visit[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class VisitsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a visit for the current agent. agentId is always derived from the
   * authenticated user and never accepted from the client. The referenced
   * client and property must exist.
   */
  async create(dto: CreateVisitDto, userId: string): Promise<Visit> {
    await this.ensureClientExists(dto.clientId);
    await this.ensurePropertyExists(dto.propertyId);

    return this.prisma.visit.create({
      data: {
        clientId: dto.clientId,
        propertyId: dto.propertyId,
        agentId: userId,
        visitDate: new Date(dto.visitDate),
        status: dto.status,
        notes: dto.notes,
      },
      include: visitInclude,
    });
  }

  /**
   * Lists visits with pagination and optional status filtering.
   * Admins see all visits; agents see only their own.
   */
  async findAll(query: QueryVisitsDto, user: AuthenticatedUser): Promise<PaginatedVisits> {
    const { page, limit, status } = query;

    const where: Prisma.VisitWhereInput = {
      ...(status ? { status } : {}),
      ...(user.role === Role.ADMIN ? {} : { agentId: user.id }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.visit.findMany({
        where,
        include: visitInclude,
        orderBy: { visitDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.visit.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<Visit> {
    const visit = await this.prisma.visit.findUnique({
      where: { id },
      include: visitInclude,
    });

    if (!visit) {
      throw new NotFoundException(`Visit with id ${id} not found`);
    }

    this.assertCanManage(visit, user);
    return visit;
  }

  async update(id: string, dto: UpdateVisitDto, user: AuthenticatedUser): Promise<Visit> {
    await this.findOne(id, user);

    if (dto.clientId) {
      await this.ensureClientExists(dto.clientId);
    }
    if (dto.propertyId) {
      await this.ensurePropertyExists(dto.propertyId);
    }

    return this.prisma.visit.update({
      where: { id },
      data: {
        clientId: dto.clientId,
        propertyId: dto.propertyId,
        visitDate: dto.visitDate ? new Date(dto.visitDate) : undefined,
        status: dto.status,
        notes: dto.notes,
      },
      include: visitInclude,
    });
  }

  async remove(id: string, user: AuthenticatedUser): Promise<Visit> {
    await this.findOne(id, user);

    return this.prisma.visit.delete({
      where: { id },
      include: visitInclude,
    });
  }

  private async ensureClientExists(clientId: string): Promise<void> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true },
    });
    if (!client) {
      throw new BadRequestException(`Client with id ${clientId} does not exist`);
    }
  }

  private async ensurePropertyExists(propertyId: string): Promise<void> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true },
    });
    if (!property) {
      throw new BadRequestException(`Property with id ${propertyId} does not exist`);
    }
  }

  private assertCanManage(visit: Visit, user: AuthenticatedUser): void {
    if (user.role !== Role.ADMIN && visit.agentId !== user.id) {
      throw new ForbiddenException('You can only access visits assigned to you');
    }
  }
}
