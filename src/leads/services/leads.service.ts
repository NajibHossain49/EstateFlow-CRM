import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Lead, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a lead assigned to the current user by default. assignedAgentId is
   * always derived from the authenticated user and never accepted from the client.
   */
  create(dto: CreateLeadDto, userId: string): Promise<Lead> {
    return this.prisma.lead.create({
      data: { ...dto, assignedAgentId: userId },
      include: leadInclude,
    });
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
    await this.findOne(id, user);

    return this.prisma.lead.update({
      where: { id },
      data: dto,
      include: leadInclude,
    });
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
