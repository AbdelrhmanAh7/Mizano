import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

const ORG_ID = 'org-001';

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  status: 'ACTIVE',
  roleId: 'role-1',
  role: { id: 'role-1', name: 'Admin' },
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  role: {
    findFirst: jest.fn(),
  },
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  // ── CREATE ──────────────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      email: 'new@example.com',
      password: 'Password1',
      name: 'New User',
      roleId: 'role-1',
    };

    it('creates a user with hashed password', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.role.findFirst.mockResolvedValue({ id: 'role-1', organizationId: ORG_ID });
      mockPrisma.user.create.mockResolvedValue({ ...mockUser, email: dto.email });

      const result = await service.create(ORG_ID, dto);
      expect(result.email).toBe('new@example.com');
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: dto.email,
            passwordHash: 'hashed-password',
            organizationId: ORG_ID,
          }),
        }),
      );
    });

    it('throws ConflictException for duplicate email in same org', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);

      await expect(service.create(ORG_ID, dto)).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException for invalid roleId', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.role.findFirst.mockResolvedValue(null);

      await expect(service.create(ORG_ID, dto)).rejects.toThrow(BadRequestException);
    });

    it('enforces organizationId when checking email uniqueness', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.role.findFirst.mockResolvedValue({ id: 'role-1' });
      mockPrisma.user.create.mockResolvedValue(mockUser);

      await service.create(ORG_ID, dto);
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: dto.email, organizationId: ORG_ID },
      });
    });
  });

  // ── READ (findAll) ──────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated users', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 20 });
      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    });

    it('applies search filter on name and email', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { search: 'test' });
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: ORG_ID,
            OR: expect.arrayContaining([
              { name: { contains: 'test', mode: 'insensitive' } },
              { email: { contains: 'test', mode: 'insensitive' } },
            ]),
          }),
        }),
      );
    });

    it('always scopes by organizationId', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: ORG_ID }),
        }),
      );
    });
  });

  // ── READ (findOne) ──────────────────────────────────────────────

  describe('findOne', () => {
    it('returns a user by id', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);

      const result = await service.findOne(ORG_ID, 'user-1');
      expect(result.id).toBe('user-1');
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1', organizationId: ORG_ID } }),
      );
    });

    it('throws NotFoundException for missing user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── UPDATE ──────────────────────────────────────────────────────

  describe('update', () => {
    it('updates user fields', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue({ ...mockUser, name: 'Updated' });

      const result = await service.update(ORG_ID, 'user-1', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });

    it('throws NotFoundException if user does not exist', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.update(ORG_ID, 'bad-id', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException on email conflict', async () => {
      mockPrisma.user.findFirst
        .mockResolvedValueOnce(mockUser) // existing user
        .mockResolvedValueOnce({ id: 'user-2', email: 'taken@example.com' }); // conflict

      await expect(
        service.update(ORG_ID, 'user-1', { email: 'taken@example.com' }),
      ).rejects.toThrow(ConflictException);
    });

    it('validates roleId belongs to org when changing role', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.role.findFirst.mockResolvedValue(null);

      await expect(service.update(ORG_ID, 'user-1', { roleId: 'bad-role' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('updates role when valid roleId is provided', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.role.findFirst.mockResolvedValue({ id: 'role-2', organizationId: ORG_ID });
      mockPrisma.user.update.mockResolvedValue({ ...mockUser, roleId: 'role-2' });

      const result = await service.update(ORG_ID, 'user-1', { roleId: 'role-2' });
      expect(result.roleId).toBe('role-2');
    });
  });

  // ── DELETE ──────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes a user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.user.delete.mockResolvedValue(mockUser);

      const result = await service.remove(ORG_ID, 'user-1');
      expect(result.message).toContain('deleted');
      expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    });

    it('throws NotFoundException if user does not exist', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.remove(ORG_ID, 'bad-id')).rejects.toThrow(NotFoundException);
    });

    it('scopes lookup to organizationId', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.user.delete.mockResolvedValue(mockUser);

      await service.remove(ORG_ID, 'user-1');
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: 'user-1', organizationId: ORG_ID },
      });
    });
  });
});
