import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { HealthResponseDto } from '../dto/health-response.dto';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Builds the health snapshot. Database connectivity is probed with a trivial
   * `SELECT 1`; a failure downgrades the overall status to "degraded" instead of
   * throwing, so monitoring tools always get a structured answer.
   */
  async check(): Promise<HealthResponseDto> {
    const { status: database, latencyMs } = await this.pingDatabase();

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      databaseLatencyMs: latencyMs,
      uptime: Math.floor(process.uptime()),
      version: this.config.get<string>('version') ?? '1.0.0',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Probes the database with a trivial `SELECT 1` and measures the round-trip
   * latency with a high-resolution timer. A failure downgrades the status to
   * "down" (latency null) instead of throwing.
   */
  private async pingDatabase(): Promise<{ status: 'up' | 'down'; latencyMs: number | null }> {
    const start = process.hrtime.bigint();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      return { status: 'up', latencyMs: Math.round(elapsedMs * 100) / 100 };
    } catch {
      return { status: 'down', latencyMs: null };
    }
  }
}
