import { NotFoundException } from '@nestjs/common';

/**
 * Thrown when a requested resource does not exist. Produces a consistent
 * 404 message such as "Property with id <uuid> not found".
 */
export class ResourceNotFoundException extends NotFoundException {
  constructor(resource: string, id?: string) {
    super(id ? `${resource} with id ${id} not found` : `${resource} not found`);
  }
}
