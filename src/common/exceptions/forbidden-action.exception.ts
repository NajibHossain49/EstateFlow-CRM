import { ForbiddenException } from '@nestjs/common';

/** Thrown when an authenticated user tries to act on a resource they don't own. */
export class ForbiddenActionException extends ForbiddenException {
  constructor(message = 'You do not have permission to perform this action') {
    super(message);
  }
}
