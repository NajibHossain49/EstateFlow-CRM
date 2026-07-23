import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Activity, ActivityType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

export interface RecordActivityInput {
  type: ActivityType;
  description: string;
  createdBy: string;
  leadId?: string | null;
}

const activityInclude = {
  creator: { select: { id: true, name: true, email: true, role: true } },
} satisfies Prisma.ActivityInclude;

@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger(ActivitiesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records an activity in the audit timeline. This is called internally by the
   * Lead and Visit modules — there is no public endpoint to create activities.
   *
   * When a transaction client (`tx`) is supplied the write joins the caller's
   * transaction and errors propagate, so it can be committed/rolled back
   * atomically with the primary action (e.g. lead/visit creation).
   *
   * Without `tx` it is best-effort: a failure to write a standalone audit entry
   * is logged but never propagated, so it cannot break the CRM action that
   * triggered it (e.g. recording a status change on update).
   */
  async record(input: RecordActivityInput, tx?: Prisma.TransactionClient): Promise<void> {
    const data = {
      type: input.type,
      description: input.description,
      createdBy: input.createdBy,
      createdById: input.createdBy,
      leadId: input.leadId ?? null,
    };

    if (tx) {
      await tx.activity.create({ data });
      return;
    }

    try {
      await this.prisma.activity.create({ data });
    } catch (error) {
      this.logger.warn(
        `Failed to record activity (${input.type}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Returns the activity timeline for a lead, newest first.
   * Access mirrors the Lead module: admins see any lead, agents only their own.
   */
  async findByLead(leadId: string, user: AuthenticatedUser): Promise<Activity[]> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId },
      select: { id: true, assignedAgentId: true },
    });

    if (!lead) {
      throw new NotFoundException(`Lead with id ${leadId} not found`);
    }

    if (user.role !== Role.ADMIN && lead.assignedAgentId !== user.id) {
      throw new ForbiddenException('You can only view activities for leads assigned to you');
    }

    return this.prisma.activity.findMany({
      where: { leadId },
      include: activityInclude,
      orderBy: { createdAt: 'desc' },
    });
  }
}
