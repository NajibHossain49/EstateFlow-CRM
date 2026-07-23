import { Injectable } from '@nestjs/common';
import {
  Activity,
  LeadStatus,
  Prisma,
  PropertyStatus,
  PropertyType,
  Role,
  Visit,
  VisitStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  LeadPipelineItemDto,
  MonthlySummaryItemDto,
  OverviewResponseDto,
  PropertyDistributionResponseDto,
} from '../dto/dashboard-response.dto';

const UPCOMING_WINDOW_DAYS = 7;
const MONTHLY_SUMMARY_MONTHS = 6;

interface MonthCountRow {
  month: string;
  count: number;
}

/**
 * Scope filters derived from the current user. Admins get an empty (global)
 * filter; agents are restricted to the records they own, matching the access
 * rules enforced by the individual CRM modules.
 */
interface DashboardScope {
  property: Prisma.PropertyWhereInput;
  client: Prisma.ClientWhereInput;
  lead: Prisma.LeadWhereInput;
  visit: Prisma.VisitWhereInput;
  activity: Prisma.ActivityWhereInput;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * High-level KPI counts. Uses groupBy so property/lead/visit status buckets
   * each come from a single aggregate query; totals are derived from the buckets
   * (no extra count round-trips). All four queries are issued in parallel.
   */
  async getOverview(user: AuthenticatedUser): Promise<OverviewResponseDto> {
    const scope = this.buildScope(user);

    const [propertyByStatus, leadByStatus, visitByStatus, totalClients] = await Promise.all([
      this.prisma.property.groupBy({
        by: ['status'],
        _count: { _all: true },
        where: scope.property,
      }),
      this.prisma.lead.groupBy({
        by: ['status'],
        _count: { _all: true },
        where: scope.lead,
      }),
      this.prisma.visit.groupBy({
        by: ['status'],
        _count: { _all: true },
        where: scope.visit,
      }),
      this.prisma.client.count({ where: scope.client }),
    ]);

    const propertyStatusCounts = this.toCountMap(
      Object.values(PropertyStatus),
      propertyByStatus.map((row) => [row.status, row._count._all]),
    );
    const leadStatusCounts = this.toCountMap(
      Object.values(LeadStatus),
      leadByStatus.map((row) => [row.status, row._count._all]),
    );
    const visitStatusCounts = this.toCountMap(
      Object.values(VisitStatus),
      visitByStatus.map((row) => [row.status, row._count._all]),
    );

    const totalProperties = this.sum(Object.values(propertyStatusCounts));
    const totalLeads = this.sum(Object.values(leadStatusCounts));

    return {
      totalProperties,
      availableProperties: propertyStatusCounts[PropertyStatus.AVAILABLE],
      soldProperties: propertyStatusCounts[PropertyStatus.SOLD],
      rentedProperties: propertyStatusCounts[PropertyStatus.RENTED],
      totalClients,
      totalLeads,
      leadsByStatus: leadStatusCounts,
      scheduledVisits: visitStatusCounts[VisitStatus.SCHEDULED],
      completedVisits: visitStatusCounts[VisitStatus.COMPLETED],
      cancelledVisits: visitStatusCounts[VisitStatus.CANCELLED],
    };
  }

  /**
   * Latest 10 activities, newest first. `take: 10` keeps the result set tiny and
   * the ordering is served by the createdAt column.
   */
  getRecentActivities(user: AuthenticatedUser): Promise<Activity[]> {
    const scope = this.buildScope(user);

    return this.prisma.activity.findMany({
      where: scope.activity,
      include: {
        creator: { select: { id: true, name: true, email: true, role: true } },
        lead: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }

  /**
   * Scheduled visits happening within the next 7 days, soonest first.
   * The date-range predicate is index-backed and only future scheduled rows are returned.
   */
  getUpcomingVisits(user: AuthenticatedUser): Promise<Visit[]> {
    const scope = this.buildScope(user);
    const now = new Date();
    const windowEnd = new Date(now.getTime() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    return this.prisma.visit.findMany({
      where: {
        ...scope.visit,
        status: VisitStatus.SCHEDULED,
        visitDate: { gte: now, lte: windowEnd },
      },
      include: {
        client: { select: { id: true, name: true, phone: true } },
        property: { select: { id: true, title: true, location: true } },
        agent: { select: { id: true, name: true, email: true } },
      },
      orderBy: { visitDate: 'asc' },
    });
  }

  /**
   * Lead counts per status for the pipeline view. A single groupBy provides the
   * data; missing statuses are zero-filled and returned in enum order.
   */
  async getLeadPipeline(user: AuthenticatedUser): Promise<LeadPipelineItemDto[]> {
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

    return Object.values(LeadStatus).map((status) => ({ status, count: counts[status] }));
  }

  /**
   * Property counts grouped by type and by status (two groupBy queries issued
   * in parallel), each zero-filled across the full enum.
   */
  async getPropertyDistribution(user: AuthenticatedUser): Promise<PropertyDistributionResponseDto> {
    const scope = this.buildScope(user);

    const [byType, byStatus] = await Promise.all([
      this.prisma.property.groupBy({
        by: ['propertyType'],
        _count: { _all: true },
        where: scope.property,
      }),
      this.prisma.property.groupBy({
        by: ['status'],
        _count: { _all: true },
        where: scope.property,
      }),
    ]);

    const typeCounts = this.toCountMap(
      Object.values(PropertyType),
      byType.map((row) => [row.propertyType, row._count._all]),
    );
    const statusCounts = this.toCountMap(
      Object.values(PropertyStatus),
      byStatus.map((row) => [row.status, row._count._all]),
    );

    return {
      byType: Object.values(PropertyType).map((propertyType) => ({
        propertyType,
        count: typeCounts[propertyType],
      })),
      byStatus: Object.values(PropertyStatus).map((status) => ({
        status,
        count: statusCounts[status],
      })),
    };
  }

  /**
   * Monthly summary for the trailing 6 months: new leads, completed visits and
   * won deals. Aggregation (date_trunc + GROUP BY) runs in the database via raw
   * SQL so only one small row-per-month result set is returned for each metric.
   */
  async getMonthlySummary(user: AuthenticatedUser): Promise<MonthlySummaryItemDto[]> {
    const isAdmin = user.role === Role.ADMIN;
    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHLY_SUMMARY_MONTHS - 1), 1),
    );

    const leadAgentFilter = isAdmin
      ? Prisma.empty
      : Prisma.sql`AND "assignedAgentId" = ${user.id}::uuid`;
    const visitAgentFilter = isAdmin ? Prisma.empty : Prisma.sql`AND "agentId" = ${user.id}::uuid`;

    const [newLeadRows, completedVisitRows, wonDealRows] = await Promise.all([
      this.prisma.$queryRaw<MonthCountRow[]>(Prisma.sql`
        SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
               count(*)::int AS count
        FROM "leads"
        WHERE "createdAt" >= ${start} ${leadAgentFilter}
        GROUP BY 1
      `),
      this.prisma.$queryRaw<MonthCountRow[]>(Prisma.sql`
        SELECT to_char(date_trunc('month', "visitDate"), 'YYYY-MM') AS month,
               count(*)::int AS count
        FROM "visits"
        WHERE "visitDate" >= ${start} AND "status" = 'COMPLETED' ${visitAgentFilter}
        GROUP BY 1
      `),
      this.prisma.$queryRaw<MonthCountRow[]>(Prisma.sql`
        SELECT to_char(date_trunc('month', "updatedAt"), 'YYYY-MM') AS month,
               count(*)::int AS count
        FROM "leads"
        WHERE "updatedAt" >= ${start} AND "status" = 'WON' ${leadAgentFilter}
        GROUP BY 1
      `),
    ]);

    const newLeads = this.toRowMap(newLeadRows);
    const completedVisits = this.toRowMap(completedVisitRows);
    const wonDeals = this.toRowMap(wonDealRows);

    return this.lastMonths(MONTHLY_SUMMARY_MONTHS).map((month) => ({
      month,
      newLeads: newLeads.get(month) ?? 0,
      completedVisits: completedVisits.get(month) ?? 0,
      wonDeals: wonDeals.get(month) ?? 0,
    }));
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildScope(user: AuthenticatedUser): DashboardScope {
    if (user.role === Role.ADMIN) {
      return { property: {}, client: {}, lead: {}, visit: {}, activity: {} };
    }

    return {
      property: { createdBy: user.id },
      client: { createdBy: user.id },
      lead: { assignedAgentId: user.id },
      visit: { agentId: user.id },
      activity: { createdBy: user.id },
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

  private toRowMap(rows: MonthCountRow[]): Map<string, number> {
    return new Map(rows.map((row) => [row.month, row.count]));
  }

  private sum(values: number[]): number {
    return values.reduce((total, value) => total + value, 0);
  }

  private lastMonths(count: number): string[] {
    const now = new Date();
    const months: string[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      months.push(month);
    }
    return months;
  }
}
