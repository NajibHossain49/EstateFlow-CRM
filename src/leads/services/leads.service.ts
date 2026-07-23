import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityType, Lead, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivitiesService } from '../../activities/services/activities.service';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { PaginatedResult, buildPaginationMeta, getSkip } from '../../common/utils/pagination.util';
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
   * Records a LEAD_CREATED activity on the lead timeline.
   */
  async create(dto: CreateLeadDto, userId: string): Promise<Lead> {
    const lead = await this.prisma.lead.create({
      data: { ...dto, assignedAgentId: userId },
      include: leadInclude,
    });

    await this.activities.record({
      type: ActivityType.LEAD_CREATED,
      description: 'Lead created',
      createdBy: userId,
      leadId: lead.id,
    });

    return lead;
  }

  /**
   * Lists leads with search, filtering, sorting and pagination.
   * Admins see all leads; agents see only the leads assigned to them.
   */
  async findAll(query: QueryLeadsDto, user: AuthenticatedUser): Promise<PaginatedResult<Lead>> {
    const { page, limit, sortBy, sortOrder } = query;
    const where = this.buildWhere(query, user);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        include: leadInclude,
        orderBy: { [sortBy]: sortOrder },
        skip: getSkip(page, limit),
        take: limit,
      }),
      this.prisma.lead.count({ where }),
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
    if (source) {
      where.source = { contains: source, mode: 'insensitive' };
    }
    if (assignedAgent) {
      where.assignedAgentId = assignedAgent;
    }
    if (createdFrom || createdTo) {
      where.createdAt = {
        ...(createdFrom ? { gte: new Date(createdFrom) } : {}),
        ...(createdTo ? { lte: new Date(createdTo) } : {}),
      };
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { source: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Ownership scope wins: agents only ever see leads assigned to them.
    if (user.role !== Role.ADMIN) {
      where.assignedAgentId = user.id;
    }

    return where;
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<Lead> {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: leadInclude,
    });

    if (!lead) {
      throw new NotFoundException(`Lead with id ${id} not found`);
    }

    this.assertCanManage(lead, user);
    return lead;
  }

  async update(id: string, dto: UpdateLeadDto, user: AuthenticatedUser): Promise<Lead> {
    const existing = await this.findOne(id, user);

    const updated = await this.prisma.lead.update({
      where: { id },
      data: dto,
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

  async remove(id: string, user: AuthenticatedUser): Promise<Lead> {
    await this.findOne(id, user);

    return this.prisma.lead.delete({
      where: { id },
      include: leadInclude,
    });
  }

  private assertCanManage(lead: Lead, user: AuthenticatedUser): void {
    if (user.role !== Role.ADMIN && lead.assignedAgentId !== user.id) {
      throw new ForbiddenException('You can only access leads assigned to you');
    }
  }
}
