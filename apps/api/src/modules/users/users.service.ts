import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, createUserDto: CreateUserDto) {
    const { email, password, name, roleId } = createUserDto;

    // Check if email already exists in organization
    const existingUser = await this.prisma.user.findFirst({
      where: { email, organizationId },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists in this organization');
    }

    // Verify role belongs to organization
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, organizationId },
    });

    if (!role) {
      throw new BadRequestException('Invalid role');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        roleId,
        organizationId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        roleId: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
      },
    });

    return user;
  }

  async findAll(organizationId: string, query: PaginationDto) {
    const { page = 1, limit = 20, search, sortBy = 'createdAt', sortOrder = 'desc' } = query;

    const where = {
      organizationId,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          roleId: true,
          role: {
            select: {
              id: true,
              name: true,
            },
          },
          createdAt: true,
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(organizationId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        roleId: true,
        role: {
          select: {
            id: true,
            name: true,
            permissions: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async update(organizationId: string, id: string, updateUserDto: UpdateUserDto) {
    const existingUser = await this.prisma.user.findFirst({
      where: { id, organizationId },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    // Check email uniqueness if changing email
    if (updateUserDto.email && updateUserDto.email !== existingUser.email) {
      const emailExists = await this.prisma.user.findFirst({
        where: { email: updateUserDto.email, organizationId, id: { not: id } },
      });

      if (emailExists) {
        throw new ConflictException('Email already exists');
      }
    }

    // Verify role if changing
    if (updateUserDto.roleId) {
      const role = await this.prisma.role.findFirst({
        where: { id: updateUserDto.roleId, organizationId },
      });

      if (!role) {
        throw new BadRequestException('Invalid role');
      }
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: updateUserDto,
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        roleId: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
        updatedAt: true,
      },
    });

    return user;
  }

  async remove(organizationId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.delete({ where: { id } });

    return { message: 'User deleted successfully' };
  }
}
