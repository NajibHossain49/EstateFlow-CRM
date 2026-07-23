import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivityType, Prisma, Role, Visit, VisitStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivitiesService } from '../../activities/services/activities.service';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { PaginatedResult, buildPaginationMeta, getSkip } from '../../common/utils/pagination.util';
import { CreateVisitDto } from '../dto/create-visit.dto';
import { QueryVisitsDto } from '../dto/query-visits.dto';
import { UpdateVisitDto } from '../dto/update-visit.dto';

const visitInclude = {
  client: { select: { id: true, name: true, phone: true, email: true } },
  property: { select: { id: true, title: true, location: true, price: true, status: true } },
  agent: { select: { id: true, name: true, email: true, role: true } },
} satisfies Prisma.VisitInclude;

@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activities: ActivitiesService,
  ) {}

  /**
   * Creates a visit for the current agent. agentId is always derived from the
   * authenticated user and never accepted from the client. The referenced
   * client and property must exist. Records a VISIT_CREATED activity (and a
   * VISIT_COMPLETED activity when created already completed).
   */
  async create(dto: CreateVisitDto, userId: string): Promise<Visit> {
    await this.ensureClientExists(dto.clientId);
    await this.ensurePropertyExists(dto.propertyId);
    if (dto.leadId) {
      await this.ensureLeadExists(dto.leadId);
    }

    const visit = await this.prisma.visit.create({
      data: {
        clientId: dto.clientId,
        propertyId: dto.propertyId,
        agentId: userId,
        leadId: dto.leadId,
        visitDate: new Date(dto.visitDate),
        status: dto.status,
        notes: dto.notes,
      },
      include: visitInclude,
    });

    await this.activities.record({
      type: ActivityType.VISIT_CREATED,
      description: 'Visit created',
      createdBy: userId,
      leadId: visit.leadId,
    });

    if (visit.status === VisitStatus.COMPLETED) {
      await this.activities.record({
        type: ActivityType.VISIT_COMPLETED,
        description: 'Visit completed',
        createdBy: userId,
        leadId: visit.leadId,
      });
    }

    return visit;
  }

  /**
   * Lists visits with search, filtering, sorting and pagination.
   * Admins see all visits; agents see only their own.
   */
  async findAll(query: QueryVisitsDto, user: AuthenticatedUser): Promise<PaginatedResult<Visit>> {
    const { page, limit, sortBy, sortOrder } = query;
    const where = this.buildWhere(query, user);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.visit.findMany({
        where,
        include: visitInclude,
        orderBy: { [sortBy]: sortOrder },
        skip: getSkip(page, limit),
        take: limit,
      }),
      this.prisma.visit.count({ where }),
    ]);

    return { items, meta: buildPaginationMeta(page, limit, total) };
  }

  /** Builds the Prisma filter dynamically, ignoring undefined query params. */
  private buildWhere(query: QueryVisitsDto, user: AuthenticatedUser): Prisma.VisitWhereInput {
    const { search, status, agentId, clientId, propertyId, fromDate, toDate } = query;
    const where: Prisma.VisitWhereInput = {};

    if (status) {
      where.status = status;
    }
    if (agentId) {
      where.agentId = agentId;
    }
    if (clientId) {
      where.clientId = clientId;
    }
    if (propertyId) {
      where.propertyId = propertyId;
    }
    if (fromDate || toDate) {
      where.visitDate = {
        ...(fromDate ? { gte: new Date(fromDate) } : {}),
        ...(toDate ? { lte: new Date(toDate) } : {}),
      };
    }
    if (search) {
      where.OR = [
        { notes: { contains: search, mode: 'insensitive' } },
        { client: { name: { contains: search, mode: 'insensitive' } } },
        { property: { title: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // Ownership scope wins: agents only ever see their own visits.
    if (user.role !== Role.ADMIN) {
      where.agentId = user.id;
    }

    return where;
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
    const existing = await this.findOne(id, user);

    if (dto.clientId) {
      await this.ensureClientExists(dto.clientId);
    }
    if (dto.propertyId) {
      await this.ensurePropertyExists(dto.propertyId);
    }

    const updated = await this.prisma.visit.update({
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

    // Record completion only on the transition into COMPLETED.
    const justCompleted =
      updated.status === VisitStatus.COMPLETED && existing.status !== VisitStatus.COMPLETED;
    if (justCompleted) {
      await this.activities.record({
        type: ActivityType.VISIT_COMPLETED,
        description: 'Visit completed',
        createdBy: user.id,
        leadId: updated.leadId,
      });
    }

    return updated;
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

  private async ensureLeadExists(leadId: string): Promise<void> {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true },
    });
    if (!lead) {
      throw new BadRequestException(`Lead with id ${leadId} does not exist`);
    }
  }

  private assertCanManage(visit: Visit, user: AuthenticatedUser): void {
    if (user.role !== Role.ADMIN && visit.agentId !== user.id) {
      throw new ForbiddenException('You can only access visits assigned to you');
    }
  }
}
