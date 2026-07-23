import { BadRequestException, Injectable } from '@nestjs/common';
import { ActivityType, Prisma, Role, Visit, VisitStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivitiesService } from '../../activities/services/activities.service';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  PaginatedResult,
  buildPaginationMeta,
  getSkip,
} from '../../common/pagination/pagination.util';
import { buildOrderBy } from '../../common/sorting/sorting.util';
import { caseInsensitiveContains, dateRange } from '../../common/filters/filter.util';
import { withDeleted } from '../../common/prisma/soft-delete';
import { ForbiddenActionException } from '../../common/exceptions/forbidden-action.exception';
import { InvalidReferenceException } from '../../common/exceptions/invalid-reference.exception';
import { ResourceNotFoundException } from '../../common/exceptions/resource-not-found.exception';
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

    // Visit + its activity entries are written atomically: if any activity write
    // fails the visit is rolled back too, keeping the timeline consistent.
    return this.prisma.$transaction(async (tx) => {
      const visit = await tx.visit.create({
        data: {
          clientId: dto.clientId,
          propertyId: dto.propertyId,
          agentId: userId,
          leadId: dto.leadId,
          visitDate: new Date(dto.visitDate),
          status: dto.status,
          notes: dto.notes,
          createdById: userId,
        },
        include: visitInclude,
      });

      await this.activities.record(
        {
          type: ActivityType.VISIT_CREATED,
          description: 'Visit created',
          createdBy: userId,
          leadId: visit.leadId,
        },
        tx,
      );

      if (visit.status === VisitStatus.COMPLETED) {
        await this.activities.record(
          {
            type: ActivityType.VISIT_COMPLETED,
            description: 'Visit completed',
            createdBy: userId,
            leadId: visit.leadId,
          },
          tx,
        );
      }

      return visit;
    });
  }

  /**
   * Lists visits with search, filtering, sorting and pagination.
   * Admins see all visits; agents see only their own.
   * Admins may pass includeDeleted=true to also see soft-deleted visits.
   */
  async findAll(query: QueryVisitsDto, user: AuthenticatedUser): Promise<PaginatedResult<Visit>> {
    const { page, limit, sortBy, sortOrder } = query;
    const where = this.buildWhere(query, user);
    const includeDeleted = user.role === Role.ADMIN && query.includeDeleted === true;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.visit.findMany(
        withDeleted(
          {
            where,
            include: visitInclude,
            orderBy: buildOrderBy(sortBy, sortOrder),
            skip: getSkip(page, limit),
            take: limit,
          },
          includeDeleted,
        ),
      ),
      this.prisma.visit.count(withDeleted({ where }, includeDeleted)),
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
    where.visitDate = dateRange(fromDate, toDate);
    if (search) {
      where.OR = [
        { notes: caseInsensitiveContains(search) },
        { client: { name: caseInsensitiveContains(search) } },
        { property: { title: caseInsensitiveContains(search) } },
      ];
    }

    // Ownership scope wins: agents only ever see their own visits.
    if (user.role !== Role.ADMIN) {
      where.agentId = user.id;
    }

    return where;
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<Visit> {
    const visit = await this.prisma.visit.findFirst({
      where: { id },
      include: visitInclude,
    });

    if (!visit) {
      throw new ResourceNotFoundException('Visit', id);
    }

    this.assertCanManage(visit, user);
    return visit;
  }

  async update(id: string, dto: UpdateVisitDto, user: AuthenticatedUser): Promise<Visit> {
    // Pre-check needs only the owner and current status (no relation JOINs).
    const existing = await this.prisma.visit.findFirst({
      where: { id },
      select: { agentId: true, status: true },
    });
    if (!existing) {
      throw new ResourceNotFoundException('Visit', id);
    }
    this.assertCanManage(existing, user);

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
        updatedById: user.id,
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

  /** Soft delete: stamps deletedAt / deletedById instead of removing the row. */
  async remove(id: string, user: AuthenticatedUser): Promise<Visit> {
    const existing = await this.prisma.visit.findFirst({
      where: { id },
      select: { agentId: true },
    });
    if (!existing) {
      throw new ResourceNotFoundException('Visit', id);
    }
    this.assertCanManage(existing, user);

    return this.prisma.visit.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: user.id },
      include: visitInclude,
    });
  }

  /** Restores a soft-deleted visit (assigned agent or admin). */
  async restore(id: string, user: AuthenticatedUser): Promise<Visit> {
    const visit = await this.prisma.visit.findFirst(
      withDeleted({ where: { id }, include: visitInclude }, true),
    );

    if (!visit) {
      throw new ResourceNotFoundException('Visit', id);
    }
    this.assertCanManage(visit, user);
    if (!visit.deletedAt) {
      throw new BadRequestException('Visit is not deleted');
    }

    return this.prisma.visit.update({
      where: { id },
      data: { deletedAt: null, deletedById: null, updatedById: user.id },
      include: visitInclude,
    });
  }

  private async ensureClientExists(clientId: string): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId },
      select: { id: true },
    });
    if (!client) {
      throw new InvalidReferenceException('Client', clientId);
    }
  }

  private async ensurePropertyExists(propertyId: string): Promise<void> {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId },
      select: { id: true },
    });
    if (!property) {
      throw new InvalidReferenceException('Property', propertyId);
    }
  }

  private async ensureLeadExists(leadId: string): Promise<void> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId },
      select: { id: true },
    });
    if (!lead) {
      throw new InvalidReferenceException('Lead', leadId);
    }
  }

  private assertCanManage(visit: Pick<Visit, 'agentId'>, user: AuthenticatedUser): void {
    if (user.role !== Role.ADMIN && visit.agentId !== user.id) {
      throw new ForbiddenActionException('You can only access visits assigned to you');
    }
  }
}
