import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { PrismaService } from '../../prisma/prisma.service';

const ORG_ID = 'org-001';

const mockRole = {
  id: 'role-1',
  name: 'Admin',
  description: 'Full access',
  isDefault: true,
  organizationId: ORG_ID,
  permissions: [{ module: 'sales', actions: ['view', 'create'] }],
  _count: { users: 0 },
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrisma = {
  role: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  permission: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  user: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('RolesService', () => {
  let service: RolesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  // ── CREATE ──────────────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      name: 'Manager',
      description: 'Manager role',
      permissions: [{ module: 'sales', actions: ['view', 'create'] }],
    };

    it('creates a role with permissions', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);
      mockPrisma.role.create.mockResolvedValue({ ...mockRole, name: 'Manager' });

      const result = await service.create(ORG_ID, dto);
      expect(result.name).toBe('Manager');
      expect(mockPrisma.role.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Manager',
            organizationId: ORG_ID,
          }),
        }),
      );
    });

    it('throws ConflictException if role name already exists', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(mockRole);

      await expect(service.create(ORG_ID, dto)).rejects.toThrow(ConflictException);
    });

    it('enforces organizationId when checking for duplicates', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);
      mockPrisma.role.create.mockResolvedValue(mockRole);

      await service.create(ORG_ID, dto);
      expect(mockPrisma.role.findFirst).toHaveBeenCalledWith({
        where: { name: 'Manager', organizationId: ORG_ID },
      });
    });
  });

  // ── READ (findAll) ──────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated roles', async () => {
      mockPrisma.role.findMany.mockResolvedValue([mockRole]);
      mockPrisma.role.count.mockResolvedValue(1);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 20 });
      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    });

    it('applies search filter', async () => {
      mockPrisma.role.findMany.mockResolvedValue([]);
      mockPrisma.role.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { search: 'admin' });
      expect(mockPrisma.role.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: ORG_ID,
            OR: expect.arrayContaining([{ name: { contains: 'admin', mode: 'insensitive' } }]),
          }),
        }),
      );
    });

    it('defaults to page 1, limit 20, sort by createdAt desc', async () => {
      mockPrisma.role.findMany.mockResolvedValue([]);
      mockPrisma.role.count.mockResolvedValue(0);

      await service.findAll(ORG_ID);
      expect(mockPrisma.role.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  // ── READ (findOne) ──────────────────────────────────────────────

  describe('findOne', () => {
    it('returns a role by id', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(mockRole);

      const result = await service.findOne(ORG_ID, 'role-1');
      expect(result.id).toBe('role-1');
      expect(mockPrisma.role.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'role-1', organizationId: ORG_ID } }),
      );
    });

    it('throws NotFoundException for missing role', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── UPDATE ──────────────────────────────────────────────────────

  describe('update', () => {
    const updateDto = {
      name: 'Super Admin',
      permissions: [{ module: 'sales', actions: ['view', 'create', 'edit'] }],
    };

    it('updates role name and permissions in a transaction', async () => {
      mockPrisma.role.findFirst
        .mockResolvedValueOnce(mockRole) // existing check
        .mockResolvedValueOnce(null); // duplicate name check (none found)

      const updatedRole = { ...mockRole, name: 'Super Admin' };
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
        const tx = {
          permission: { deleteMany: jest.fn(), createMany: jest.fn() },
          role: { update: jest.fn().mockResolvedValue(updatedRole) },
        };
        return fn(tx);
      });

      const result = await service.update(ORG_ID, 'role-1', updateDto);
      expect(result.name).toBe('Super Admin');
    });

    it('throws NotFoundException if role does not exist', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);

      await expect(service.update(ORG_ID, 'bad-id', updateDto)).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if new name conflicts', async () => {
      mockPrisma.role.findFirst
        .mockResolvedValueOnce(mockRole) // exists
        .mockResolvedValueOnce({ id: 'role-2', name: 'Super Admin' }); // conflict

      await expect(service.update(ORG_ID, 'role-1', updateDto)).rejects.toThrow(ConflictException);
    });
  });

  // ── DELETE ──────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes a role with no assigned users', async () => {
      mockPrisma.role.findFirst.mockResolvedValue({
        ...mockRole,
        name: 'Custom',
        isDefault: false,
        _count: { users: 0 },
      });
      mockPrisma.$transaction.mockResolvedValue([]);

      const result = await service.remove(ORG_ID, 'role-1');
      expect(result.message).toContain('deleted');
    });

    it('throws NotFoundException if role does not exist', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);

      await expect(service.remove(ORG_ID, 'bad-id')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if role has assigned users', async () => {
      mockPrisma.role.findFirst.mockResolvedValue({ ...mockRole, _count: { users: 3 } });

      await expect(service.remove(ORG_ID, 'role-1')).rejects.toThrow(BadRequestException);
    });

    it('prevents deletion of default Admin role', async () => {
      mockPrisma.role.findFirst.mockResolvedValue({
        ...mockRole,
        isDefault: true,
        name: 'Admin',
        _count: { users: 0 },
      });

      await expect(service.remove(ORG_ID, 'role-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ── SEED DEFAULTS ───────────────────────────────────────────────

  describe('seedDefaultRoles', () => {
    it('creates roles that do not yet exist', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null); // none exist
      mockPrisma.role.create.mockResolvedValue(mockRole);

      const result = await service.seedDefaultRoles(ORG_ID);
      expect(result.message).toContain('new roles');
      expect(mockPrisma.role.create).toHaveBeenCalled();
    });

    it('skips roles that already exist', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(mockRole); // all exist
      const result = await service.seedDefaultRoles(ORG_ID);
      expect(result.message).toContain('0 new roles');
      expect(mockPrisma.role.create).not.toHaveBeenCalled();
    });
  });

  // ── ASSIGN ROLE ─────────────────────────────────────────────────

  describe('assignRole', () => {
    const dto = { userId: 'user-1', roleId: 'role-1' };

    it('assigns a role to a user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      mockPrisma.role.findFirst.mockResolvedValue(mockRole);
      mockPrisma.user.update.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        name: 'User',
        role: { id: 'role-1', name: 'Admin', description: 'Full access' },
      });

      const result = await service.assignRole(ORG_ID, dto);
      expect(result.message).toContain('assigned');
    });

    it('throws NotFoundException if user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.assignRole(ORG_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if role not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      mockPrisma.role.findFirst.mockResolvedValue(null);

      await expect(service.assignRole(ORG_ID, dto)).rejects.toThrow(NotFoundException);
    });
  });
});
