import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiTooManyRequestsResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import {
  THROTTLE_LOGIN_LIMIT,
  THROTTLE_REGISTER_LIMIT,
  THROTTLE_TTL_MS,
} from '../../common/constants/security.constants';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { AuthService } from '../services/auth.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  // Tight limit to curb automated account creation / abuse: 3 per minute.
  @Throttle({ default: { limit: THROTTLE_REGISTER_LIMIT, ttl: THROTTLE_TTL_MS } })
  @ResponseMessage('User registered successfully')
  @ApiOperation({ summary: 'Register a new user account (rate limited: 3/min)' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded (max 3 requests per minute)' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Brute-force protection on credentials: 5 attempts per minute.
  @Throttle({ default: { limit: THROTTLE_LOGIN_LIMIT, ttl: THROTTLE_TTL_MS } })
  @ResponseMessage('Login successful')
  @ApiOperation({ summary: 'Authenticate and receive a JWT access token (rate limited: 5/min)' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded (max 5 requests per minute)' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
