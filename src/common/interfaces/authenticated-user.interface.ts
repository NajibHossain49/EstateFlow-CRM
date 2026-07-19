import { Role } from '@prisma/client';

/**
 * The shape of the user object attached to the request by the JWT strategy.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}
