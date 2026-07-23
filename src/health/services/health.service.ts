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
    const database = await this.pingDatabase();

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      uptime: Math.floor(process.uptime()),
      version: this.config.get<string>('version') ?? '1.0.0',
      timestamp: new Date().toISOString(),
    };
  }

  private async pingDatabase(): Promise<'up' | 'down'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }
}
