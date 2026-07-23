import { BadRequestException, Injectable } from '@nestjs/common';
import { ActivityType, Lead, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivitiesService } from '../../activities/services/activities.service';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  PaginatedResult,
  buildPaginationMeta,
  getSkip,
} from '../../common/pagination/pagination.util';
import { buildOrderBy } from '../../common/sorting/sorting.util';
import { caseInsensitiveContains, dateRange, searchAcross } from '../../common/filters/filter.util';
import { withDeleted } from '../../common/prisma/soft-delete';
import { ForbiddenActionException } from '../../common/exceptions/forbidden-action.exception';
import { ResourceNotFoundException } from '../../common/exceptions/resource-not-found.exception';
import { CreateLeadDto } from '../dto/create-lead.dto';
import { QueryLeadsDto } from '../dto/query-leads.dto';
import { UpdateLeadDto } from '../dto/update-lead.dto';

const leadInclude = {
  assignedAgent: { select: { id: true, name: true, email: true, role: true } },
} satisfies Prisma.LeadInclude;

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activities: ActivitiesService,
  ) {}

  /**
   * Creates a lead assigned to the current user by default. assignedAgentId is
   * always derived from the authenticated user and never accepted from the client.
   *
   * The lead row and its LEAD_CREATED activity are written inside a single
   * interactive transaction, so either both persist or neither does (the audit
   * timeline can never diverge from the lead it describes).
   */
  async create(dto: CreateLeadDto, userId: string): Promise<Lead> {
    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: { ...dto, assignedAgentId: userId, createdById: userId },
        include: leadInclude,
      });

      await this.activities.record(
        {
          type: ActivityType.LEAD_CREATED,
          description: 'Lead created',
          createdBy: userId,
          leadId: lead.id,
        },
        tx,
      );

      return lead;
    });
  }

  /**
   * Lists leads with search, filtering, sorting and pagination.
   * Admins see all leads; agents see only the leads assigned to them.
   * Admins may pass includeDeleted=true to also see soft-deleted leads.
   */
  async findAll(query: QueryLeadsDto, user: AuthenticatedUser): Promise<PaginatedResult<Lead>> {
    const { page, limit, sortBy, sortOrder } = query;
    const where = this.buildWhere(query, user);
    const includeDeleted = user.role === Role.ADMIN && query.includeDeleted === true;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany(
        withDeleted(
          {
            where,
            include: leadInclude,
            orderBy: buildOrderBy(sortBy, sortOrder),
            skip: getSkip(page, limit),
            take: limit,
          },
          includeDeleted,
        ),
      ),
      this.prisma.lead.count(withDeleted({ where }, includeDeleted)),
    ]);

    return { items, meta: buildPaginationMeta(page, limit, total) };
  }

  /** Builds the Prisma filter dynamically, ignoring undefined query params. */
  private buildWhere(query: QueryLeadsDto, user: AuthenticatedUser): Prisma.LeadWhereInput {
    const { search, status, source, assignedAgent, createdFrom, createdTo } = query;
    const where: Prisma.LeadWhereInput = {};

    if (status) {
      where.status = status;
    }
    where.source = caseInsensitiveContains(source);
    if (assignedAgent) {
      where.assignedAgentId = assignedAgent;
    }
    where.createdAt = dateRange(createdFrom, createdTo);
    where.OR = searchAcross<Prisma.LeadWhereInput>(
      ['name', 'phone', 'email', 'source', 'notes'],
      search,
    );

    // Ownership scope wins: agents only ever see leads assigned to them.
    if (user.role !== Role.ADMIN) {
      where.assignedAgentId = user.id;
    }

    return where;
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<Lead> {
    const lead = await this.prisma.lead.findFirst({
      where: { id },
      include: leadInclude,
    });

    if (!lead) {
      throw new ResourceNotFoundException('Lead', id);
    }

    this.assertCanManage(lead, user);
    return lead;
  }

  async update(id: string, dto: UpdateLeadDto, user: AuthenticatedUser): Promise<Lead> {
    const existing = await this.findOne(id, user);

    const updated = await this.prisma.lead.update({
      where: { id },
      data: { ...dto, updatedById: user.id },
      include: leadInclude,
    });

    const statusChanged = dto.status !== undefined && dto.status !== existing.status;
    if (statusChanged) {
      await this.activities.record({
        type: ActivityType.STATUS_CHANGED,
        description: `Lead status changed from ${existing.status} to ${updated.status}`,
        createdBy: user.id,
        leadId: id,
      });
    } else {
      await this.activities.record({
        type: ActivityType.LEAD_UPDATED,
        description: 'Lead updated',
        createdBy: user.id,
        leadId: id,
      });
    }

    return updated;
  }

  /** Soft delete: stamps deletedAt / deletedById instead of removing the row. */
  async remove(id: string, user: AuthenticatedUser): Promise<Lead> {
    await this.findOne(id, user);

    return this.prisma.lead.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: user.id },
      include: leadInclude,
    });
  }

  /** Restores a soft-deleted lead (assigned agent or admin). */
  async restore(id: string, user: AuthenticatedUser): Promise<Lead> {
    const lead = await this.prisma.lead.findFirst(
      withDeleted({ where: { id }, include: leadInclude }, true),
    );

    if (!lead) {
      throw new ResourceNotFoundException('Lead', id);
    }
    this.assertCanManage(lead, user);
    if (!lead.deletedAt) {
      throw new BadRequestException('Lead is not deleted');
    }

    return this.prisma.lead.update({
      where: { id },
      data: { deletedAt: null, deletedById: null, updatedById: user.id },
      include: leadInclude,
    });
  }

  private assertCanManage(lead: Lead, user: AuthenticatedUser): void {
    if (user.role !== Role.ADMIN && lead.assignedAgentId !== user.id) {
      throw new ForbiddenActionException('You can only access leads assigned to you');
    }
  }
}
