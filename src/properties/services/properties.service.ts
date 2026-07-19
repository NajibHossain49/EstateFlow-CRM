import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Property, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CreatePropertyDto } from '../dto/create-property.dto';
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

  findAll(): Promise<Property[]> {
    return this.prisma.property.findMany({
      include: propertyInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<Property> {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: propertyInclude,
    });

    if (!property) {
      throw new NotFoundException(`Property with id ${id} not found`);
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
      throw new ForbiddenException('You can only manage properties you created');
    }
  }
}
