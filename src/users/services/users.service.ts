import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';

const SALT_ROUNDS = 10;

// Fields safe to expose in API responses (never the password hash).
const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a user, hashing the provided plaintext password before storing it.
   */
  async create(data: CreateUserDto): Promise<PublicUser> {
    const password = await bcrypt.hash(data.password, SALT_ROUNDS);

    return this.prisma.user.create({
      data: { ...data, password },
      select: publicUserSelect,
    });
  }

  /**
   * Returns the full user record (including password hash) for authentication.
   */
  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findAll(): Promise<PublicUser[]> {
    return this.prisma.user.findMany({
      select: publicUserSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<PublicUser> {
    await this.findOne(id);

    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: publicUserSelect,
    });
  }

  async remove(id: string): Promise<PublicUser> {
    await this.findOne(id);

    return this.prisma.user.delete({
      where: { id },
      select: publicUserSelect,
    });
  }
}
