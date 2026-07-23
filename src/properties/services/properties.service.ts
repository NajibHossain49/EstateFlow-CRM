import { Injectable } from '@nestjs/common';
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
      data: { ...dto, createdBy: userId },
      include: propertyInclude,
    });
  }

  /**
   * Lists properties with search, filtering, sorting and pagination.
   * Properties are viewable by any authenticated user (no ownership scoping).
   */
  async findAll(query: QueryPropertiesDto): Promise<PaginatedResult<Property>> {
    const { page, limit, sortBy, sortOrder } = query;
    const where = this.buildWhere(query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.property.findMany({
        where,
        include: propertyInclude,
        orderBy: buildOrderBy(sortBy, sortOrder),
        skip: getSkip(page, limit),
        take: limit,
      }),
      this.prisma.property.count({ where }),
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
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: propertyInclude,
    });

    if (!property) {
      throw new ResourceNotFoundException('Property', id);
    }

    return property;
  }

  async update(id: string, dto: UpdatePropertyDto, user: AuthenticatedUser): Promise<Property> {
    const property = await this.findOne(id);
    this.assertCanManage(property, user);

    return this.prisma.property.update({
      where: { id },
      data: dto,
      include: propertyInclude,
    });
  }

  async remove(id: string, user: AuthenticatedUser): Promise<Property> {
    const property = await this.findOne(id);
    this.assertCanManage(property, user);

    return this.prisma.property.delete({
      where: { id },
      include: propertyInclude,
    });
  }

  /**
   * Admins can manage every property; agents only the ones they created.
   */
  private assertCanManage(property: Property, user: AuthenticatedUser): void {
    if (user.role !== Role.ADMIN && property.createdBy !== user.id) {
      throw new ForbiddenActionException('You can only manage properties you created');
    }
  }
}
