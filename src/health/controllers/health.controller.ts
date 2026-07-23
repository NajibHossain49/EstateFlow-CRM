import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { HealthResponseDto } from '../dto/health-response.dto';
import { HealthService } from '../services/health.service';

@ApiTags('Health')
// Health probes are polled frequently and must never be rate-limited.
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ResponseMessage('Service is healthy')
  @ApiOperation({
    summary: 'Health check',
    description: 'Reports application status, database connectivity, uptime and version. Public.',
  })
  @ApiOkResponse({ type: HealthResponseDto })
  check(): Promise<HealthResponseDto> {
    return this.healthService.check();
  }
}
