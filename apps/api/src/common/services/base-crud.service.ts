import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationDto } from '../dto/pagination.dto';
import { CursorPaginationDto } from '../dto/cursor-pagination.dto';
import { cursorPaginate, CursorPaginatedResult } from '../utils/cursor-paginate';
import { WhereBuilder } from '../utils/where-builder';

/**
 * Configuration for BaseCrudService behavior.
 */
export interface BaseCrudConfig {
  /** Prisma model name (e.g. 'customer', 'invoice'). Used to access prisma[modelName]. */
  modelName: string;

  /** Human-readable entity name for error messages (e.g. 'Customer', 'Invoice'). */
  entityName: string;

  /** Whether this entity uses soft delete (deletedAt). Default: false. */
  softDelete?: boolean;

  /** Fields to search when a `search` query param is provided. */
  searchFields?: string[];

  /** Default Prisma `include` for list queries. */
  defaultInclude?: Record<string, unknown>;

  /** Default Prisma `include` for single-record queries. */
  detailInclude?: Record<string, unknown>;

  /** Default sort field. Default: 'createdAt'. */
  defaultSortBy?: string;

  /** Default sort order. Default: 'desc'. */
  defaultSortOrder?: 'asc' | 'desc';
}

/**
 * Abstract base service providing standard CRUD operations.
 *
 * Subclasses implement `create`, `update`, and any domain-specific methods.
 * The base provides: findAll, findAllCursor, findOne, remove.
 *
 * Usage:
 *   @Injectable()
 *   export class CustomersService extends BaseCrudService {
 *     constructor(prisma: PrismaService) {
 *       super(prisma, {
 *         modelName: 'customer',
 *         entityName: 'Customer',
 *         softDelete: true,
 *         searchFields: ['name', 'email', 'phone'],
 *         defaultInclude: { priceList: true },
 *       });
 *     }
 *   }
 */
export abstract class BaseCrudService {
  protected readonly config: Required<
    Pick<
      BaseCrudConfig,
      'modelName' | 'entityName' | 'softDelete' | 'defaultSortBy' | 'defaultSortOrder'
    >
  > &
    BaseCrudConfig;

  constructor(
    protected readonly prisma: PrismaService,
    config: BaseCrudConfig,
  ) {
    this.config = {
      softDelete: false,
      defaultSortBy: 'createdAt',
      defaultSortOrder: 'desc',
      ...config,
    };
  }

  protected get model(): {
    findMany: (...args: unknown[]) => Promise<unknown[]>;
    count: (...args: unknown[]) => Promise<number>;
    findFirst: (...args: unknown[]) => Promise<unknown>;
    create: (...args: unknown[]) => Promise<unknown>;
    update: (...args: unknown[]) => Promise<unknown>;
    delete: (...args: unknown[]) => Promise<unknown>;
  } {
    return (
      this.prisma as unknown as Record<
        string,
        {
          findMany: (...args: unknown[]) => Promise<unknown[]>;
          count: (...args: unknown[]) => Promise<number>;
          findFirst: (...args: unknown[]) => Promise<unknown>;
          create: (...args: unknown[]) => Promise<unknown>;
          update: (...args: unknown[]) => Promise<unknown>;
          delete: (...args: unknown[]) => Promise<unknown>;
        }
      >
    )[this.config.modelName];
  }

  /**
   * Build a WhereBuilder pre-configured with org and soft-delete filters.
   */
  protected baseWhere(organizationId: string): WhereBuilder {
    const wb = new WhereBuilder().org(organizationId);
    if (this.config.softDelete) wb.notDeleted();
    return wb;
  }

  /**
   * Build the order-by clause from query params.
   */
  protected buildOrderBy(sortBy?: string, sortOrder?: string): Record<string, string> {
    return {
      [sortBy || this.config.defaultSortBy]: sortOrder || this.config.defaultSortOrder,
    };
  }

  /**
   * Offset-based paginated list.
   */
  async findAll(
    organizationId: string,
    query: PaginationDto,
  ): Promise<{
    data: unknown[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const wb = this.baseWhere(organizationId);
    if (this.config.searchFields?.length && query.search) {
      wb.search(this.config.searchFields, query.search);
    }
    const where = wb.build();
    const orderBy = this.buildOrderBy(query.sortBy, query.sortOrder);

    const findArgs: Record<string, unknown> = { where, orderBy, skip, take: limit };
    if (this.config.defaultInclude) findArgs.include = this.config.defaultInclude;

    const [data, total] = await Promise.all([
      this.model.findMany(findArgs),
      this.model.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Cursor-based paginated list (for virtual scroll / infinite loading).
   */
  async findAllCursor(
    organizationId: string,
    query: CursorPaginationDto,
  ): Promise<CursorPaginatedResult<{ id: string }>> {
    const wb = this.baseWhere(organizationId);
    if (this.config.searchFields?.length && query.search) {
      wb.search(this.config.searchFields, query.search);
    }
    const where = wb.build();
    const orderBy = this.buildOrderBy(query.sortBy, query.sortOrder);

    return cursorPaginate(
      this.model as unknown as {
        findMany: (args: Record<string, unknown>) => Promise<{ id: string }[]>;
        count: (args: Record<string, unknown>) => Promise<number>;
      },
      where,
      orderBy,
      {
        cursor: query.cursor,
        take: query.take ?? 50,
        include: this.config.defaultInclude,
      },
    );
  }

  /**
   * Find a single record by ID.
   *
   * @throws NotFoundException if not found (or soft-deleted).
   */
  async findOne(organizationId: string, id: string): Promise<unknown> {
    const where = this.baseWhere(organizationId).field('id', id).build();

    const findArgs: Record<string, unknown> = { where };
    const include = this.config.detailInclude ?? this.config.defaultInclude;
    if (include) findArgs.include = include;

    const record = await this.model.findFirst(findArgs);
    if (!record) {
      throw new NotFoundException(`${this.config.entityName} not found`);
    }
    return record;
  }

  /**
   * Delete (soft or hard) a single record.
   *
   * @throws NotFoundException if not found.
   */
  async remove(organizationId: string, id: string): Promise<{ message: string }> {
    // Ensure the record exists
    await this.findOne(organizationId, id);

    if (this.config.softDelete) {
      await this.model.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    } else {
      await this.model.delete({ where: { id } });
    }

    return { message: `${this.config.entityName} deleted successfully` };
  }
}
