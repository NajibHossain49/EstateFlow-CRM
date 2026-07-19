import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Client, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CreateClientDto } from '../dto/create-client.dto';
import { UpdateClientDto } from '../dto/update-client.dto';

const clientInclude = {
  creator: { select: { id: true, name: true, email: true, role: true } },
} satisfies Prisma.ClientInclude;

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a client owned by the current user. createdBy is always derived
   * from the authenticated user and never accepted from the client.
   */
  create(dto: CreateClientDto, userId: string): Promise<Client> {
    return this.prisma.client.create({
      data: { ...dto, createdBy: userId },
      include: clientInclude,
    });
  }

  /**
   * Admins see all clients; agents see only the clients they created.
   */
  findAll(user: AuthenticatedUser): Promise<Client[]> {
    return this.prisma.client.findMany({
      where: user.role === Role.ADMIN ? undefined : { createdBy: user.id },
      include: clientInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<Client> {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: clientInclude,
    });

    if (!client) {
      throw new NotFoundException(`Client with id ${id} not found`);
    }

    this.assertCanManage(client, user);
    return client;
  }

  async update(id: string, dto: UpdateClientDto, user: AuthenticatedUser): Promise<Client> {
    await this.findOne(id, user);

    return this.prisma.client.update({
      where: { id },
      data: dto,
      include: clientInclude,
    });
  }

  async remove(id: string, user: AuthenticatedUser): Promise<Client> {
    await this.findOne(id, user);

    return this.prisma.client.delete({
      where: { id },
      include: clientInclude,
    });
  }

  private assertCanManage(client: Client, user: AuthenticatedUser): void {
    if (user.role !== Role.ADMIN && client.createdBy !== user.id) {
      throw new ForbiddenException('You can only access clients you created');
    }
  }
}
