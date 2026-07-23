import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, Property, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  PaginatedResult,
  buildPaginationMeta,
  getSkip,
} from '../../common/pagination/pagination.util';
import { buildOrderBy } from '../../common/sorting/sorting.util';
import { numericRange, searchAcross } from '../../common/filters/filter.util';
import { withDeleted } from '../../common/prisma/soft-delete';
import { ForbiddenActionException } from '../../common/exceptions/forbidden-action.exception';
import { ResourceNotFoundException } from '../../common/exceptions/resource-not-found.exception';
import { CreatePropertyDto } from '../dto/create-property.dto';
import { QueryPropertiesDto } from '../dto/query-properties.dto';
import { UpdatePropertyDto } from '../dto/update-property.dto';

const propertyInclude = {
  creator: { select: { id: true, name: true, email: true, role: true } },
} satisfies Prisma.PropertyInclude;

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a property owned by the current user. createdBy is always derived
   * from the authenticated user and never accepted from the client.
   */
  create(dto: CreatePropertyDto, userId: string): Promise<Property> {
    return this.prisma.property.create({
      data: { ...dto, createdBy: userId, createdById: userId },
      include: propertyInclude,
    });
  }

  /**
   * Lists properties with search, filtering, sorting and pagination.
   * Properties are viewable by any authenticated user (no ownership scoping).
   * Admins may pass includeDeleted=true to also see soft-deleted properties.
   */
  async findAll(
    query: QueryPropertiesDto,
    user: AuthenticatedUser,
  ): Promise<PaginatedResult<Property>> {
    const { page, limit, sortBy, sortOrder } = query;
    const where = this.buildWhere(query);
    const includeDeleted = user.role === Role.ADMIN && query.includeDeleted === true;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.property.findMany(
        withDeleted(
          {
            where,
            include: propertyInclude,
            orderBy: buildOrderBy(sortBy, sortOrder),
            skip: getSkip(page, limit),
            take: limit,
          },
          includeDeleted,
        ),
      ),
      this.prisma.property.count(withDeleted({ where }, includeDeleted)),
    ]);

    return { items, meta: buildPaginationMeta(page, limit, total) };
  }

  /** Builds the Prisma filter dynamically, ignoring undefined query params. */
  private buildWhere(query: QueryPropertiesDto): Prisma.PropertyWhereInput {
    const { search, status, propertyType, minPrice, maxPrice, minBedrooms, maxBedrooms } = query;
    const where: Prisma.PropertyWhereInput = {};

    if (status) {
      where.status = status;
    }
    if (propertyType) {
      where.propertyType = propertyType;
    }
    where.price = numericRange(minPrice, maxPrice);
    where.bedrooms = numericRange(minBedrooms, maxBedrooms);
    where.OR = searchAcross<Prisma.PropertyWhereInput>(
      ['title', 'description', 'location'],
      search,
    );

    return where;
  }

  async findOne(id: string): Promise<Property> {
    const property = await this.prisma.property.findFirst({
      where: { id },
      include: propertyInclude,
    });

    if (!property) {
      throw new ResourceNotFoundException('Property', id);
    }

    return property;
  }

  async update(id: string, dto: UpdatePropertyDto, user: AuthenticatedUser): Promise<Property> {
    await this.assertCanManageById(id, user);

    return this.prisma.property.update({
      where: { id },
      data: { ...dto, updatedById: user.id },
      include: propertyInclude,
    });
  }

  /**
   * Soft delete: the row is kept and stamped with deletedAt / deletedById so it
   * disappears from normal queries but can be restored. findOne already excludes
   * soft-deleted rows, so deleting an already-deleted property returns 404.
   */
  async remove(id: string, user: AuthenticatedUser): Promise<Property> {
    await this.assertCanManageById(id, user);

    return this.prisma.property.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: user.id },
      include: propertyInclude,
    });
  }

  /** Restores a soft-deleted property (owner or admin). */
  async restore(id: string, user: AuthenticatedUser): Promise<Property> {
    const property = await this.prisma.property.findFirst(
      withDeleted({ where: { id }, include: propertyInclude }, true),
    );

    if (!property) {
      throw new ResourceNotFoundException('Property', id);
    }
    this.assertCanManage(property, user);
    if (!property.deletedAt) {
      throw new BadRequestException('Property is not deleted');
    }

    return this.prisma.property.update({
      where: { id },
      data: { deletedAt: null, deletedById: null, updatedById: user.id },
      include: propertyInclude,
    });
  }

  /**
   * Ownership check for write paths. Selects only the owner column (no relation
   * JOIN) instead of reusing findOne, which would fetch the full record and its
   * creator relation just to read createdBy.
   */
  private async assertCanManageById(id: string, user: AuthenticatedUser): Promise<void> {
    const property = await this.prisma.property.findFirst({
      where: { id },
      select: { createdBy: true },
    });
    if (!property) {
      throw new ResourceNotFoundException('Property', id);
    }
    this.assertCanManage(property, user);
  }

  /**
   * Admins can manage every property; agents only the ones they created.
   */
  private assertCanManage(property: Pick<Property, 'createdBy'>, user: AuthenticatedUser): void {
    if (user.role !== Role.ADMIN && property.createdBy !== user.id) {
      throw new ForbiddenActionException('You can only manage properties you created');
    }
  }
}
