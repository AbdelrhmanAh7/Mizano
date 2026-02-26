/**
 * Composable Prisma `where` clause builder.
 *
 * Usage:
 *   const where = new WhereBuilder()
 *     .org(organizationId)
 *     .notDeleted()
 *     .field('status', status)
 *     .field('customerId', customerId)
 *     .search(['name', 'email'], search)
 *     .dateRange('date', dateFrom, dateTo)
 *     .build();
 */
export class WhereBuilder<T extends Record<string, unknown> = Record<string, unknown>> {
  private conditions: Record<string, unknown>[] = [];

  /** Filter by organizationId (required for multi-tenancy). */
  org(organizationId: string): this {
    this.conditions.push({ organizationId });
    return this;
  }

  /** Exclude soft-deleted records. */
  notDeleted(): this {
    this.conditions.push({ deletedAt: null });
    return this;
  }

  /** Add a condition only if the value is defined and not empty. */
  field(key: string, value: unknown): this {
    if (value !== undefined && value !== null && value !== '') {
      this.conditions.push({ [key]: value });
    }
    return this;
  }

  /** Boolean field filter (only applies if value is explicitly boolean). */
  bool(key: string, value: boolean | undefined | null): this {
    if (typeof value === 'boolean') {
      this.conditions.push({ [key]: value });
    }
    return this;
  }

  /** Case-insensitive search across multiple fields using OR. */
  search(fields: string[], query: string | undefined): this {
    if (!query?.trim()) return this;
    const term = query.trim();
    this.conditions.push({
      OR: fields.map((f) => ({
        [f]: { contains: term, mode: 'insensitive' },
      })),
    });
    return this;
  }

  /** Date range filter on a single field. */
  dateRange(field: string, from: string | Date | undefined, to: string | Date | undefined): this {
    if (!from && !to) return this;
    const filter: Record<string, unknown> = {};
    if (from) filter.gte = new Date(from);
    if (to) filter.lte = new Date(to);
    this.conditions.push({ [field]: filter });
    return this;
  }

  /** Add a raw condition object. */
  raw(condition: Record<string, unknown>): this {
    this.conditions.push(condition);
    return this;
  }

  /** Add a condition only if the predicate is true. */
  when(predicate: boolean, condition: Record<string, unknown>): this {
    if (predicate) this.conditions.push(condition);
    return this;
  }

  /** Build the final where clause. */
  build(): T {
    if (this.conditions.length === 0) return {} as T;
    if (this.conditions.length === 1) return this.conditions[0] as T;
    return { AND: this.conditions } as unknown as T;
  }
}
