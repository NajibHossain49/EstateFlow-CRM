import { Injectable } from '@nestjs/common';
import { LeadStatus, Prisma, PropertyStatus, Role, VisitStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { toCsv } from '../../common/utils/csv.util';
import { ExportReportQueryDto, ReportType, SalesReportQueryDto } from '../dto/report-query.dto';
import {
  AgentReportItemDto,
  LeadsReportDto,
  PropertiesReportDto,
  SalesReportDto,
  VisitsReportDto,
} from '../dto/report-response.dto';

/**
 * Role-scoped filters. Admins report on all data; agents only on the records
 * they own — mirroring the access rules used across the CRM modules.
 */
interface ReportScope {
  property: Prisma.PropertyWhereInput;
  lead: Prisma.LeadWhereInput;
  visit: Prisma.VisitWhereInput;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sales report. A "deal" is a property in the SOLD state; revenue is the sum
   * of those sale prices. A single `aggregate` call returns the count, sum and
   * average in one round-trip. The optional from/to window filters on the sale
   * timestamp (updatedAt, i.e. when the property was marked SOLD).
   */
  async getSales(query: SalesReportQueryDto, user: AuthenticatedUser): Promise<SalesReportDto> {
    const scope = this.buildScope(user);
    const where: Prisma.PropertyWhereInput = {
      ...scope.property,
      status: PropertyStatus.SOLD,
    };

    const dateFilter = this.buildDateFilter(query.from, query.to);
    if (dateFilter) {
      where.updatedAt = dateFilter;
    }

    const aggregate = await this.prisma.property.aggregate({
      where,
      _count: { _all: true },
      _sum: { price: true },
      _avg: { price: true },
    });

    const totalDeals = aggregate._count._all;
    const totalRevenue = this.toNumber(aggregate._sum.price);
    const averageDealValue = this.toNumber(aggregate._avg.price);

    return {
      totalDeals,
      totalRevenue: this.round2(totalRevenue),
      averageDealValue: this.round2(averageDealValue),
    };
  }

  /**
   * Lead counts grouped by status. One `groupBy` provides every bucket; missing
   * statuses are zero-filled and returned in enum order.
   */
  async getLeads(user: AuthenticatedUser): Promise<LeadsReportDto> {
    const scope = this.buildScope(user);

    const grouped = await this.prisma.lead.groupBy({
      by: ['status'],
      _count: { _all: true },
      where: scope.lead,
    });

    const counts = this.toCountMap(
      Object.values(LeadStatus),
      grouped.map((row) => [row.status, row._count._all]),
    );
    const byStatus = Object.values(LeadStatus).map((status) => ({ status, count: counts[status] }));
    const total = byStatus.reduce((sum, entry) => sum + entry.count, 0);

    return { total, byStatus };
  }

  /**
   * Per-agent statistics. Four `groupBy` queries (leads, won leads, visits,
   * properties) plus one user lookup run in parallel, then merge in memory via
   * O(1) map lookups keyed by the agent id — no nested loops or per-agent queries.
   * Admins see every user; agents see only their own row.
   */
  async getAgents(user: AuthenticatedUser): Promise<AgentReportItemDto[]> {
    const scope = this.buildScope(user);
    const isAdmin = user.role === Role.ADMIN;
    const userWhere: Prisma.UserWhereInput = isAdmin ? {} : { id: user.id };

    const [users, leadCounts, wonCounts, visitCounts, propertyCounts] = await Promise.all([
      this.prisma.user.findMany({
        where: userWhere,
        select: { id: true, name: true, email: true, role: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.lead.groupBy({
        by: ['assignedAgentId'],
        _count: { _all: true },
        where: scope.lead,
      }),
      this.prisma.lead.groupBy({
        by: ['assignedAgentId'],
        _count: { _all: true },
        where: { ...scope.lead, status: LeadStatus.WON },
      }),
      this.prisma.visit.groupBy({
        by: ['agentId'],
        _count: { _all: true },
        where: scope.visit,
      }),
      this.prisma.property.groupBy({
        by: ['createdBy'],
        _count: { _all: true },
        where: scope.property,
      }),
    ]);

    const leadMap = new Map(leadCounts.map((row) => [row.assignedAgentId, row._count._all]));
    const wonMap = new Map(wonCounts.map((row) => [row.assignedAgentId, row._count._all]));
    const visitMap = new Map(visitCounts.map((row) => [row.agentId, row._count._all]));
    const propertyMap = new Map(propertyCounts.map((row) => [row.createdBy, row._count._all]));

    return users.map((agent) => ({
      agentId: agent.id,
      name: agent.name,
      email: agent.email,
      role: agent.role,
      totalLeads: leadMap.get(agent.id) ?? 0,
      totalVisits: visitMap.get(agent.id) ?? 0,
      wonDeals: wonMap.get(agent.id) ?? 0,
      assignedProperties: propertyMap.get(agent.id) ?? 0,
    }));
  }

  /**
   * Property portfolio report. `aggregate` yields the total plus average price
   * and area in one query; a parallel `groupBy` yields the per-status counts.
   */
  async getProperties(user: AuthenticatedUser): Promise<PropertiesReportDto> {
    const scope = this.buildScope(user);

    const [aggregate, byStatus] = await Promise.all([
      this.prisma.property.aggregate({
        where: scope.property,
        _count: { _all: true },
        _avg: { price: true, area: true },
      }),
      this.prisma.property.groupBy({
        by: ['status'],
        _count: { _all: true },
        where: scope.property,
      }),
    ]);

    const statusCounts = this.toCountMap(
      Object.values(PropertyStatus),
      byStatus.map((row) => [row.status, row._count._all]),
    );

    return {
      total: aggregate._count._all,
      available: statusCounts[PropertyStatus.AVAILABLE],
      sold: statusCounts[PropertyStatus.SOLD],
      rented: statusCounts[PropertyStatus.RENTED],
      averagePrice: this.round2(this.toNumber(aggregate._avg.price)),
      averageArea: this.round2(this.toNumber(aggregate._avg.area)),
    };
  }

  /**
   * Visit report. One `groupBy` on status yields all three buckets; the
   * completion rate is completed / total expressed as a percentage.
   */
  async getVisits(user: AuthenticatedUser): Promise<VisitsReportDto> {
    const scope = this.buildScope(user);

    const grouped = await this.prisma.visit.groupBy({
      by: ['status'],
      _count: { _all: true },
      where: scope.visit,
    });

    const counts = this.toCountMap(
      Object.values(VisitStatus),
      grouped.map((row) => [row.status, row._count._all]),
    );
    const scheduled = counts[VisitStatus.SCHEDULED];
    const completed = counts[VisitStatus.COMPLETED];
    const cancelled = counts[VisitStatus.CANCELLED];
    const total = scheduled + completed + cancelled;
    const completionRate = total === 0 ? 0 : this.round2((completed / total) * 100);

    return { scheduled, completed, cancelled, total, completionRate };
  }

  /**
   * Builds the CSV payload for the requested report. Reuses the report methods
   * above so there is a single source of truth for the numbers.
   */
  async exportCsv(
    query: ExportReportQueryDto,
    user: AuthenticatedUser,
  ): Promise<{ filename: string; content: string }> {
    switch (query.report) {
      case ReportType.LEADS: {
        const report = await this.getLeads(user);
        return {
          filename: 'leads-report.csv',
          content: toCsv(
            ['status', 'count'],
            report.byStatus.map((row) => [row.status, row.count]),
          ),
        };
      }
      case ReportType.AGENTS: {
        const report = await this.getAgents(user);
        return {
          filename: 'agents-report.csv',
          content: toCsv(
            [
              'agentId',
              'name',
              'email',
              'role',
              'totalLeads',
              'totalVisits',
              'wonDeals',
              'assignedProperties',
            ],
            report.map((agent) => [
              agent.agentId,
              agent.name,
              agent.email,
              agent.role,
              agent.totalLeads,
              agent.totalVisits,
              agent.wonDeals,
              agent.assignedProperties,
            ]),
          ),
        };
      }
      case ReportType.PROPERTIES: {
        const report = await this.getProperties(user);
        return {
          filename: 'properties-report.csv',
          content: toCsv(
            ['total', 'available', 'sold', 'rented', 'averagePrice', 'averageArea'],
            [
              [
                report.total,
                report.available,
                report.sold,
                report.rented,
                report.averagePrice,
                report.averageArea,
              ],
            ],
          ),
        };
      }
      case ReportType.VISITS: {
        const report = await this.getVisits(user);
        return {
          filename: 'visits-report.csv',
          content: toCsv(
            ['scheduled', 'completed', 'cancelled', 'total', 'completionRate'],
            [
              [
                report.scheduled,
                report.completed,
                report.cancelled,
                report.total,
                report.completionRate,
              ],
            ],
          ),
        };
      }
      case ReportType.SALES:
      default: {
        const report = await this.getSales(query, user);
        return {
          filename: 'sales-report.csv',
          content: toCsv(
            ['totalDeals', 'totalRevenue', 'averageDealValue'],
            [[report.totalDeals, report.totalRevenue, report.averageDealValue]],
          ),
        };
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildScope(user: AuthenticatedUser): ReportScope {
    if (user.role === Role.ADMIN) {
      return { property: {}, lead: {}, visit: {} };
    }
    return {
      property: { createdBy: user.id },
      lead: { assignedAgentId: user.id },
      visit: { agentId: user.id },
    };
  }

  private buildDateFilter(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    if (!from && !to) {
      return undefined;
    }
    return {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

  private toCountMap<T extends string>(
    all: readonly T[],
    entries: Array<[T, number]>,
  ): Record<T, number> {
    const base = Object.fromEntries(all.map((value) => [value, 0])) as Record<T, number>;
    for (const [key, count] of entries) {
      base[key] = count;
    }
    return base;
  }

  private toNumber(value: Prisma.Decimal | number | null): number {
    return value === null || value === undefined ? 0 : Number(value);
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
