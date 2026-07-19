import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Protects routes by requiring a valid JWT access token.
 * Backed by the 'jwt' Passport strategy.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
