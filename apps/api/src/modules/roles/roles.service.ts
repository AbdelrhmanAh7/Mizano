import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRoleDto, UpdateRoleDto, AssignRoleDto } from './dto';
import { DEFAULT_ROLES } from './constants/default-roles.constant';

interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new role for an organization
   */
  async create(organizationId: string, createRoleDto: CreateRoleDto) {
    const { name, description, permissions } = createRoleDto;

    // Check for duplicate role name in organization
    const existingRole = await this.prisma.role.findFirst({
      where: { name, organizationId },
    });

    if (existingRole) {
      throw new ConflictException(`Role "${name}" already exists`);
    }

    // Create role with permissions
    const role = await this.prisma.role.create({
      data: {
        name,
        description,
        organizationId,
        permissions: {
          create: permissions.map((p) => ({
            module: p.module,
            actions: p.actions,
          })),
        },
      },
      include: {
        permissions: true,
        _count: { select: { users: true } },
      },
    });

    return role;
  }

  /**
   * Find all roles in an organization with pagination
   */
  async findAll(organizationId: string, params: PaginationParams = {}) {
    const {
      page = 1,
      limit = 20,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params;

    const skip = (page - 1) * limit;

    const where: any = { organizationId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [roles, total] = await Promise.all([
      this.prisma.role.findMany({
        where,
        include: {
          permissions: true,
          _count: { select: { users: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.role.count({ where }),
    ]);

    return {
      data: roles,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find a single role by ID
   */
  async findOne(organizationId: string, id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, organizationId },
      include: {
        permissions: true,
        _count: { select: { users: true } },
      },
    });

    if (!role) {
      throw new NotFoundException(`Role not found`);
    }

    return role;
  }

  /**
   * Update a role
   */
  async update(
    organizationId: string,
    id: string,
    updateRoleDto: UpdateRoleDto,
  ) {
    // Verify role exists and belongs to organization
    const existingRole = await this.prisma.role.findFirst({
      where: { id, organizationId },
    });

    if (!existingRole) {
      throw new NotFoundException(`Role not found`);
    }

    // Check for duplicate name if name is being changed
    if (updateRoleDto.name && updateRoleDto.name !== existingRole.name) {
      const duplicateRole = await this.prisma.role.findFirst({
        where: {
          name: updateRoleDto.name,
          organizationId,
          id: { not: id },
        },
      });

      if (duplicateRole) {
        throw new ConflictException(`Role "${updateRoleDto.name}" already exists`);
      }
    }

    // Update role with transaction to handle permissions
    const role = await this.prisma.$transaction(async (tx) => {
      // If permissions are being updated, delete old ones and create new ones
      if (updateRoleDto.permissions) {
        await tx.permission.deleteMany({
          where: { roleId: id },
        });

        await tx.permission.createMany({
          data: updateRoleDto.permissions.map((p) => ({
            roleId: id,
            module: p.module,
            actions: p.actions,
          })),
        });
      }

      // Update role
      return tx.role.update({
        where: { id },
        data: {
          name: updateRoleDto.name,
          description: updateRoleDto.description,
        },
        include: {
          permissions: true,
          _count: { select: { users: true } },
        },
      });
    });

    return role;
  }

  /**
   * Delete a role (soft consideration - check for users first)
   */
  async remove(organizationId: string, id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, organizationId },
      include: { _count: { select: { users: true } } },
    });

    if (!role) {
      throw new NotFoundException(`Role not found`);
    }

    // Prevent deletion if users are assigned
    if (role._count.users > 0) {
      throw new BadRequestException(
        `Cannot delete role with ${role._count.users} assigned user(s). Reassign users first.`,
      );
    }

    // Prevent deletion of default Admin role
    if (role.isDefault && role.name === 'Admin') {
      throw new BadRequestException('Cannot delete the default Admin role');
    }

    // Delete permissions first, then role
    await this.prisma.$transaction([
      this.prisma.permission.deleteMany({ where: { roleId: id } }),
      this.prisma.role.delete({ where: { id } }),
    ]);

    return { message: 'Role deleted successfully' };
  }

  /**
   * Seed default roles for an organization
   */
  async seedDefaultRoles(organizationId: string) {
    const createdRoles: any[] = [];

    for (const roleData of DEFAULT_ROLES) {
      // Check if role already exists
      const existingRole = await this.prisma.role.findFirst({
        where: { name: roleData.name, organizationId },
      });

      if (existingRole) {
        // Update existing role's permissions if needed
        createdRoles.push({ ...existingRole, status: 'existing' });
        continue;
      }

      // Create new role with permissions
      const role = await this.prisma.role.create({
        data: {
          name: roleData.name,
          description: roleData.description,
          isDefault: roleData.isDefault || false,
          organizationId,
          permissions: {
            create: roleData.permissions.map((p) => ({
              module: p.module,
              actions: p.actions,
            })),
          },
        },
        include: { permissions: true },
      });

      createdRoles.push({ ...role, status: 'created' });
    }

    return {
      message: `Seeded ${createdRoles.filter((r) => r.status === 'created').length} new roles`,
      roles: createdRoles,
    };
  }

  /**
   * Assign a role to a user
   */
  async assignRole(organizationId: string, assignRoleDto: AssignRoleDto) {
    const { userId, roleId } = assignRoleDto;

    // Verify user exists and belongs to organization
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
    });

    if (!user) {
      throw new NotFoundException(`User not found`);
    }

    // Verify role exists and belongs to organization
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, organizationId },
    });

    if (!role) {
      throw new NotFoundException(`Role not found`);
    }

    // Update user's role
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { roleId },
      select: {
        id: true,
        email: true,
        name: true,
        role: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
    });

    return {
      message: `Role "${role.name}" assigned to user successfully`,
      user: updatedUser,
    };
  }

  /**
   * Get role by name for an organization
   */
  async findByName(organizationId: string, name: string) {
    return this.prisma.role.findFirst({
      where: { name, organizationId },
      include: { permissions: true },
    });
  }
}
