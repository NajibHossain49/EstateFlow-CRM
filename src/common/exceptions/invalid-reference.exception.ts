import { BadRequestException } from '@nestjs/common';

/**
 * Thrown when a request references a related record that does not exist
 * (e.g. creating a visit for a non-existent client or property).
 */
export class InvalidReferenceException extends BadRequestException {
  constructor(resource: string, id: string) {
    super(`${resource} with id ${id} does not exist`);
  }
}
