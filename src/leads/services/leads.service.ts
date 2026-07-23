import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityType, Lead, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivitiesService } from '../../activities/services/activities.service';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CreateLeadDto } from '../dto/create-lead.dto';
import { QueryLeadsDto } from '../dto/query-leads.dto';
import { UpdateLeadDto } from '../dto/update-lead.dto';

const leadInclude = {
  assignedAgent: { select: { id: true, name: true, email: true, role: true } },
} satisfies Prisma.LeadInclude;

export interface PaginatedLeads {
  items: Lead[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

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
   * Lists leads with pagination and optional status filtering.
   * Admins see all leads; agents see only the leads assigned to them.
   */
  async findAll(query: QueryLeadsDto, user: AuthenticatedUser): Promise<PaginatedLeads> {
    const { page, limit, status } = query;

    const where: Prisma.LeadWhereInput = {
      ...(status ? { status } : {}),
      ...(user.role === Role.ADMIN ? {} : { assignedAgentId: user.id }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        include: leadInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.lead.count({ where }),
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
