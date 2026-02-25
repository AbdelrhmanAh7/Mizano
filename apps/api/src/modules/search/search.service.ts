import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JaroWinklerDistance } from 'natural';
import { PrismaService } from '../../prisma/prisma.service';
import type { GlobalSearchQueryDto, SearchEntityType } from './dto';

// ============================================
// Types
// ============================================

export interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  href: string;
  score: number;
}

export interface SearchGroup {
  type: string;
  label: string;
  results: SearchResult[];
}

export interface SearchResponse {
  data: SearchResult[];
  groups: SearchGroup[];
  query: string;
  totalResults: number;
}

export interface SearchHistoryEntry {
  id: string;
  query: string;
  resultType: string | null;
  resultId: string | null;
  resultTitle: string | null;
  clickedAt: Date;
}

/** Raw row shape returned from pg_trgm similarity queries */
interface TrgmRow {
  id: string;
  title: string;
  subtitle: string | null;
  similarity: number;
}

/** Defines how to search a given entity type */
interface EntitySearchConfig {
  type: SearchEntityType;
  label: string;
  hrefPrefix: string;
  /** SQL query template returning id, title, subtitle, similarity columns */
  buildQuery: (orgId: string, query: string, threshold: number, limit: number) => Prisma.Sql;
}

// ============================================
// Group label mapping
// ============================================

const GROUP_LABELS: Record<SearchEntityType, string> = {
  customer: 'Customers',
  vendor: 'Vendors',
  invoice: 'Invoices',
  bill: 'Bills',
  item: 'Items',
  employee: 'Employees',
  project: 'Projects',
  lead: 'Leads',
  deal: 'Deals',
  quote: 'Quotes',
  expense: 'Expenses',
};

// ============================================
// Service
// ============================================

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly entityConfigs: EntitySearchConfig[];

  constructor(private readonly prisma: PrismaService) {
    this.entityConfigs = this.buildEntityConfigs();
  }

  // ------------------------------------------
  // Public: Global fuzzy search
  // ------------------------------------------

  async search(organizationId: string, dto: GlobalSearchQueryDto): Promise<SearchResponse> {
    const query = dto.q.trim();
    const limit = dto.limit ?? 25;
    const threshold = dto.fuzzyThreshold ?? 0.3;
    const requestedTypes = dto.types;

    // Determine per-entity limit: divide total evenly, at least 3 each
    const configs = requestedTypes
      ? this.entityConfigs.filter((c) => requestedTypes.includes(c.type))
      : this.entityConfigs;

    const perEntityLimit = Math.max(3, Math.ceil(limit / configs.length));

    let hasTrgm = true;
    try {
      // Attempt fuzzy (trigram) search across all entity types in parallel
      const entityResults = await Promise.all(
        configs.map(async (config) => {
          try {
            const rows = await this.prisma.$queryRaw<TrgmRow[]>(
              config.buildQuery(organizationId, query, threshold, perEntityLimit),
            );
            return { config, rows };
          } catch (err) {
            // If pg_trgm is not available, flag for fallback
            const errMsg = err instanceof Error ? err.message : String(err);
            if (errMsg.includes('function similarity') || errMsg.includes('pg_trgm')) {
              hasTrgm = false;
            }
            this.logger.warn(`Fuzzy search failed for ${config.type}: ${errMsg}`);
            return { config, rows: [] };
          }
        }),
      );

      // If pg_trgm queries failed, fall back to ILIKE + app-level scoring
      if (!hasTrgm) {
        return await this.fallbackSearch(organizationId, query, limit, configs);
      }

      // Re-rank with JaroWinkler and build response
      const groups: SearchGroup[] = [];
      let allResults: SearchResult[] = [];

      for (const { config, rows } of entityResults) {
        if (rows.length === 0) continue;

        const results: SearchResult[] = rows.map((row) => {
          const trgmScore = Number(row.similarity);
          const jwScore = JaroWinklerDistance(query.toLowerCase(), row.title.toLowerCase());
          // Weighted combination: 60% trigram, 40% JaroWinkler
          const combinedScore = trgmScore * 0.6 + jwScore * 0.4;

          return {
            id: row.id,
            type: config.type,
            title: row.title,
            subtitle: row.subtitle ?? undefined,
            href: `${config.hrefPrefix}${row.id}`,
            score: Math.round(combinedScore * 1000) / 1000,
          };
        });

        // Sort within group by score descending
        results.sort((a, b) => b.score - a.score);

        groups.push({
          type: config.type,
          label: config.label,
          results,
        });

        allResults.push(...results);
      }

      // Sort all results by score, cap at total limit
      allResults.sort((a, b) => b.score - a.score);
      allResults = allResults.slice(0, limit);

      // Sort groups by best score in each group descending
      groups.sort((a, b) => {
        const bestA = a.results[0]?.score ?? 0;
        const bestB = b.results[0]?.score ?? 0;
        return bestB - bestA;
      });

      return {
        data: allResults,
        groups,
        query,
        totalResults: allResults.length,
      };
    } catch (error) {
      this.logger.error('Global search error', error instanceof Error ? error.stack : error);
      // Fall back to ILIKE search on any unexpected error
      return this.fallbackSearch(organizationId, query, limit, configs);
    }
  }

  // ------------------------------------------
  // Public: Search history CRUD
  // ------------------------------------------

  async getSearchHistory(userId: string, organizationId: string): Promise<SearchHistoryEntry[]> {
    const records = await this.prisma.searchHistory.findMany({
      where: { userId, organizationId },
      orderBy: { clickedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        query: true,
        resultType: true,
        resultId: true,
        resultTitle: true,
        clickedAt: true,
      },
    });
    return records;
  }

  async recordSearchHistory(
    userId: string,
    organizationId: string,
    data: {
      query: string;
      resultType?: string;
      resultId?: string;
      resultTitle?: string;
    },
  ): Promise<SearchHistoryEntry> {
    const record = await this.prisma.searchHistory.upsert({
      where: {
        organizationId_userId_query: {
          organizationId,
          userId,
          query: data.query,
        },
      },
      update: {
        clickedAt: new Date(),
        resultType: data.resultType ?? null,
        resultId: data.resultId ?? null,
        resultTitle: data.resultTitle ?? null,
      },
      create: {
        query: data.query,
        resultType: data.resultType ?? null,
        resultId: data.resultId ?? null,
        resultTitle: data.resultTitle ?? null,
        userId,
        organizationId,
        clickedAt: new Date(),
      },
      select: {
        id: true,
        query: true,
        resultType: true,
        resultId: true,
        resultTitle: true,
        clickedAt: true,
      },
    });
    return record;
  }

  async clearSearchHistory(userId: string, organizationId: string): Promise<{ deleted: number }> {
    const result = await this.prisma.searchHistory.deleteMany({
      where: { userId, organizationId },
    });
    return { deleted: result.count };
  }

  // ------------------------------------------
  // Private: Fallback ILIKE search (no pg_trgm)
  // ------------------------------------------

  private async fallbackSearch(
    organizationId: string,
    query: string,
    limit: number,
    configs: EntitySearchConfig[],
  ): Promise<SearchResponse> {
    this.logger.debug(`Using fallback ILIKE search for query: "${query}"`);

    const perEntityLimit = Math.max(3, Math.ceil(limit / configs.length));

    const searchFns: Record<string, () => Promise<SearchResult[]>> = {
      customer: () => this.fallbackSearchCustomers(organizationId, query, perEntityLimit),
      vendor: () => this.fallbackSearchVendors(organizationId, query, perEntityLimit),
      invoice: () => this.fallbackSearchInvoices(organizationId, query, perEntityLimit),
      bill: () => this.fallbackSearchBills(organizationId, query, perEntityLimit),
      item: () => this.fallbackSearchItems(organizationId, query, perEntityLimit),
      employee: () => this.fallbackSearchEmployees(organizationId, query, perEntityLimit),
      project: () => this.fallbackSearchProjects(organizationId, query, perEntityLimit),
      lead: () => this.fallbackSearchLeads(organizationId, query, perEntityLimit),
      deal: () => this.fallbackSearchDeals(organizationId, query, perEntityLimit),
      quote: () => this.fallbackSearchQuotes(organizationId, query, perEntityLimit),
      expense: () => this.fallbackSearchExpenses(organizationId, query, perEntityLimit),
    };

    const entityResults = await Promise.all(
      configs.map(async (config) => {
        const fn = searchFns[config.type];
        const results = fn ? await fn() : [];
        return { config, results };
      }),
    );

    const groups: SearchGroup[] = [];
    let allResults: SearchResult[] = [];

    for (const { config, results } of entityResults) {
      if (results.length === 0) continue;

      // Apply JaroWinkler scoring to fallback results
      const scored = results.map((r) => ({
        ...r,
        score: JaroWinklerDistance(query.toLowerCase(), r.title.toLowerCase()),
      }));
      scored.sort((a, b) => b.score - a.score);

      groups.push({ type: config.type, label: config.label, results: scored });
      allResults.push(...scored);
    }

    allResults.sort((a, b) => b.score - a.score);
    allResults = allResults.slice(0, limit);

    groups.sort((a, b) => {
      const bestA = a.results[0]?.score ?? 0;
      const bestB = b.results[0]?.score ?? 0;
      return bestB - bestA;
    });

    return { data: allResults, groups, query, totalResults: allResults.length };
  }

  // ------------------------------------------
  // Private: Entity search configs (pg_trgm)
  // ------------------------------------------

  private buildEntityConfigs(): EntitySearchConfig[] {
    return [
      {
        type: 'customer',
        label: GROUP_LABELS.customer,
        hrefPrefix: '/sales/customers/',
        buildQuery: (orgId, q, thr, lim) => Prisma.sql`
          SELECT id, name AS title, email AS subtitle,
                 GREATEST(similarity(name, ${q}), similarity(COALESCE(email,''), ${q}), similarity(COALESCE(phone,''), ${q})) AS similarity
          FROM customers
          WHERE "organizationId" = ${orgId}
            AND "deletedAt" IS NULL
            AND (similarity(name, ${q}) > ${thr} OR similarity(COALESCE(email,''), ${q}) > ${thr} OR similarity(COALESCE(phone,''), ${q}) > ${thr}
                 OR name ILIKE ${'%' + q + '%'} OR email ILIKE ${'%' + q + '%'})
          ORDER BY similarity DESC
          LIMIT ${lim}
        `,
      },
      {
        type: 'vendor',
        label: GROUP_LABELS.vendor,
        hrefPrefix: '/purchases/vendors/',
        buildQuery: (orgId, q, thr, lim) => Prisma.sql`
          SELECT id, name AS title, email AS subtitle,
                 GREATEST(similarity(name, ${q}), similarity(COALESCE(email,''), ${q})) AS similarity
          FROM vendors
          WHERE "organizationId" = ${orgId}
            AND "deletedAt" IS NULL
            AND (similarity(name, ${q}) > ${thr} OR similarity(COALESCE(email,''), ${q}) > ${thr}
                 OR name ILIKE ${'%' + q + '%'})
          ORDER BY similarity DESC
          LIMIT ${lim}
        `,
      },
      {
        type: 'invoice',
        label: GROUP_LABELS.invoice,
        hrefPrefix: '/sales/invoices/',
        buildQuery: (orgId, q, thr, lim) => Prisma.sql`
          SELECT i.id, i."invoiceNumber" AS title, c.name AS subtitle,
                 GREATEST(similarity(i."invoiceNumber", ${q}), similarity(COALESCE(c.name,''), ${q})) AS similarity
          FROM invoices i
          LEFT JOIN customers c ON c.id = i."customerId"
          WHERE i."organizationId" = ${orgId}
            AND i."deletedAt" IS NULL
            AND (similarity(i."invoiceNumber", ${q}) > ${thr} OR similarity(COALESCE(c.name,''), ${q}) > ${thr}
                 OR i."invoiceNumber" ILIKE ${'%' + q + '%'} OR c.name ILIKE ${'%' + q + '%'})
          ORDER BY similarity DESC
          LIMIT ${lim}
        `,
      },
      {
        type: 'bill',
        label: GROUP_LABELS.bill,
        hrefPrefix: '/purchases/bills/',
        buildQuery: (orgId, q, thr, lim) => Prisma.sql`
          SELECT b.id, b."billNumber" AS title, v.name AS subtitle,
                 GREATEST(similarity(b."billNumber", ${q}), similarity(COALESCE(v.name,''), ${q})) AS similarity
          FROM bills b
          LEFT JOIN vendors v ON v.id = b."vendorId"
          WHERE b."organizationId" = ${orgId}
            AND b."deletedAt" IS NULL
            AND (similarity(b."billNumber", ${q}) > ${thr} OR similarity(COALESCE(v.name,''), ${q}) > ${thr}
                 OR b."billNumber" ILIKE ${'%' + q + '%'} OR v.name ILIKE ${'%' + q + '%'})
          ORDER BY similarity DESC
          LIMIT ${lim}
        `,
      },
      {
        type: 'item',
        label: GROUP_LABELS.item,
        hrefPrefix: '/inventory/items/',
        buildQuery: (orgId, q, thr, lim) => Prisma.sql`
          SELECT id, name AS title, sku AS subtitle,
                 GREATEST(similarity(name, ${q}), similarity(COALESCE(sku,''), ${q})) AS similarity
          FROM items
          WHERE "organizationId" = ${orgId}
            AND "deletedAt" IS NULL
            AND (similarity(name, ${q}) > ${thr} OR similarity(COALESCE(sku,''), ${q}) > ${thr}
                 OR name ILIKE ${'%' + q + '%'} OR sku ILIKE ${'%' + q + '%'})
          ORDER BY similarity DESC
          LIMIT ${lim}
        `,
      },
      {
        type: 'employee',
        label: GROUP_LABELS.employee,
        hrefPrefix: '/hr/employees/',
        buildQuery: (orgId, q, thr, lim) => Prisma.sql`
          SELECT id, name AS title, COALESCE(email, "employeeNumber") AS subtitle,
                 GREATEST(similarity(name, ${q}), similarity(COALESCE(email,''), ${q}), similarity(COALESCE("employeeNumber",''), ${q})) AS similarity
          FROM employees
          WHERE "organizationId" = ${orgId}
            AND "isActive" = true
            AND (similarity(name, ${q}) > ${thr} OR similarity(COALESCE(email,''), ${q}) > ${thr}
                 OR name ILIKE ${'%' + q + '%'} OR email ILIKE ${'%' + q + '%'})
          ORDER BY similarity DESC
          LIMIT ${lim}
        `,
      },
      {
        type: 'project',
        label: GROUP_LABELS.project,
        hrefPrefix: '/projects/',
        buildQuery: (orgId, q, thr, lim) => Prisma.sql`
          SELECT id, name AS title, status AS subtitle,
                 similarity(name, ${q}) AS similarity
          FROM projects
          WHERE "organizationId" = ${orgId}
            AND (similarity(name, ${q}) > ${thr} OR name ILIKE ${'%' + q + '%'})
          ORDER BY similarity DESC
          LIMIT ${lim}
        `,
      },
      {
        type: 'lead',
        label: GROUP_LABELS.lead,
        hrefPrefix: '/crm/leads/',
        buildQuery: (orgId, q, thr, lim) => Prisma.sql`
          SELECT id, "leadName" AS title, COALESCE("companyName", email) AS subtitle,
                 GREATEST(similarity("leadName", ${q}), similarity(COALESCE(email,''), ${q}), similarity(COALESCE("companyName",''), ${q})) AS similarity
          FROM leads
          WHERE "organizationId" = ${orgId}
            AND "deletedAt" IS NULL
            AND (similarity("leadName", ${q}) > ${thr} OR similarity(COALESCE("companyName",''), ${q}) > ${thr}
                 OR "leadName" ILIKE ${'%' + q + '%'} OR "companyName" ILIKE ${'%' + q + '%'})
          ORDER BY similarity DESC
          LIMIT ${lim}
        `,
      },
      {
        type: 'deal',
        label: GROUP_LABELS.deal,
        hrefPrefix: '/crm/deals/',
        buildQuery: (orgId, q, thr, lim) => Prisma.sql`
          SELECT id, "dealName" AS title, stage AS subtitle,
                 similarity("dealName", ${q}) AS similarity
          FROM deals
          WHERE "organizationId" = ${orgId}
            AND "deletedAt" IS NULL
            AND (similarity("dealName", ${q}) > ${thr} OR "dealName" ILIKE ${'%' + q + '%'})
          ORDER BY similarity DESC
          LIMIT ${lim}
        `,
      },
      {
        type: 'quote',
        label: GROUP_LABELS.quote,
        hrefPrefix: '/sales/quotes/',
        buildQuery: (orgId, q, thr, lim) => Prisma.sql`
          SELECT qt.id, qt."quoteNumber" AS title, c.name AS subtitle,
                 GREATEST(similarity(qt."quoteNumber", ${q}), similarity(COALESCE(c.name,''), ${q})) AS similarity
          FROM quotes qt
          LEFT JOIN customers c ON c.id = qt."customerId"
          WHERE qt."organizationId" = ${orgId}
            AND qt."deletedAt" IS NULL
            AND (similarity(qt."quoteNumber", ${q}) > ${thr} OR similarity(COALESCE(c.name,''), ${q}) > ${thr}
                 OR qt."quoteNumber" ILIKE ${'%' + q + '%'} OR c.name ILIKE ${'%' + q + '%'})
          ORDER BY similarity DESC
          LIMIT ${lim}
        `,
      },
      {
        type: 'expense',
        label: GROUP_LABELS.expense,
        hrefPrefix: '/purchases/expenses/',
        buildQuery: (orgId, q, thr, lim) => Prisma.sql`
          SELECT e.id, COALESCE(e.description, e.reference, 'Expense') AS title,
                 v.name AS subtitle,
                 GREATEST(similarity(COALESCE(e.description,''), ${q}), similarity(COALESCE(e.reference,''), ${q})) AS similarity
          FROM expenses e
          LEFT JOIN vendors v ON v.id = e."vendorId"
          WHERE e."organizationId" = ${orgId}
            AND e."deletedAt" IS NULL
            AND (similarity(COALESCE(e.description,''), ${q}) > ${thr} OR similarity(COALESCE(e.reference,''), ${q}) > ${thr}
                 OR e.description ILIKE ${'%' + q + '%'} OR e.reference ILIKE ${'%' + q + '%'})
          ORDER BY similarity DESC
          LIMIT ${lim}
        `,
      },
    ];
  }

  // ------------------------------------------
  // Private: Fallback ILIKE entity searches
  // ------------------------------------------

  private async fallbackSearchCustomers(
    orgId: string,
    q: string,
    limit: number,
  ): Promise<SearchResult[]> {
    const results = await this.prisma.customer.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, email: true },
      take: limit,
      orderBy: { name: 'asc' },
    });
    return results.map((c) => ({
      id: c.id,
      type: 'customer',
      title: c.name,
      subtitle: c.email ?? undefined,
      href: `/sales/customers/${c.id}`,
      score: 0,
    }));
  }

  private async fallbackSearchVendors(
    orgId: string,
    q: string,
    limit: number,
  ): Promise<SearchResult[]> {
    const results = await this.prisma.vendor.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, email: true },
      take: limit,
      orderBy: { name: 'asc' },
    });
    return results.map((v) => ({
      id: v.id,
      type: 'vendor',
      title: v.name,
      subtitle: v.email ?? undefined,
      href: `/purchases/vendors/${v.id}`,
      score: 0,
    }));
  }

  private async fallbackSearchInvoices(
    orgId: string,
    q: string,
    limit: number,
  ): Promise<SearchResult[]> {
    const results = await this.prisma.invoice.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        OR: [
          { invoiceNumber: { contains: q, mode: 'insensitive' } },
          { customer: { name: { contains: q, mode: 'insensitive' } } },
        ],
      },
      select: { id: true, invoiceNumber: true, customer: { select: { name: true } } },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
    return results.map((inv) => ({
      id: inv.id,
      type: 'invoice',
      title: inv.invoiceNumber,
      subtitle: inv.customer?.name,
      href: `/sales/invoices/${inv.id}`,
      score: 0,
    }));
  }

  private async fallbackSearchBills(
    orgId: string,
    q: string,
    limit: number,
  ): Promise<SearchResult[]> {
    const results = await this.prisma.bill.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        OR: [
          { billNumber: { contains: q, mode: 'insensitive' } },
          { vendor: { name: { contains: q, mode: 'insensitive' } } },
        ],
      },
      select: { id: true, billNumber: true, vendor: { select: { name: true } } },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
    return results.map((b) => ({
      id: b.id,
      type: 'bill',
      title: b.billNumber,
      subtitle: b.vendor?.name,
      href: `/purchases/bills/${b.id}`,
      score: 0,
    }));
  }

  private async fallbackSearchItems(
    orgId: string,
    q: string,
    limit: number,
  ): Promise<SearchResult[]> {
    const results = await this.prisma.item.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { sku: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, sku: true },
      take: limit,
      orderBy: { name: 'asc' },
    });
    return results.map((item) => ({
      id: item.id,
      type: 'item',
      title: item.name,
      subtitle: item.sku ?? undefined,
      href: `/inventory/items/${item.id}`,
      score: 0,
    }));
  }

  private async fallbackSearchEmployees(
    orgId: string,
    q: string,
    limit: number,
  ): Promise<SearchResult[]> {
    const results = await this.prisma.employee.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { employeeNumber: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, email: true, employeeNumber: true },
      take: limit,
      orderBy: { name: 'asc' },
    });
    return results.map((emp) => ({
      id: emp.id,
      type: 'employee',
      title: emp.name,
      subtitle: emp.email ?? emp.employeeNumber ?? undefined,
      href: `/hr/employees/${emp.id}`,
      score: 0,
    }));
  }

  private async fallbackSearchProjects(
    orgId: string,
    q: string,
    limit: number,
  ): Promise<SearchResult[]> {
    const results = await this.prisma.project.findMany({
      where: { organizationId: orgId, OR: [{ name: { contains: q, mode: 'insensitive' } }] },
      select: { id: true, name: true, status: true },
      take: limit,
      orderBy: { name: 'asc' },
    });
    return results.map((p) => ({
      id: p.id,
      type: 'project',
      title: p.name,
      subtitle: p.status,
      href: `/projects/${p.id}`,
      score: 0,
    }));
  }

  private async fallbackSearchLeads(
    orgId: string,
    q: string,
    limit: number,
  ): Promise<SearchResult[]> {
    const results = await this.prisma.lead.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        OR: [
          { leadName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { companyName: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, leadName: true, email: true, companyName: true },
      take: limit,
      orderBy: { leadName: 'asc' },
    });
    return results.map((l) => ({
      id: l.id,
      type: 'lead',
      title: l.leadName,
      subtitle: l.companyName ?? l.email ?? undefined,
      href: `/crm/leads/${l.id}`,
      score: 0,
    }));
  }

  private async fallbackSearchDeals(
    orgId: string,
    q: string,
    limit: number,
  ): Promise<SearchResult[]> {
    const results = await this.prisma.deal.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        OR: [{ dealName: { contains: q, mode: 'insensitive' } }],
      },
      select: { id: true, dealName: true, stage: true },
      take: limit,
      orderBy: { dealName: 'asc' },
    });
    return results.map((d) => ({
      id: d.id,
      type: 'deal',
      title: d.dealName,
      subtitle: d.stage ?? undefined,
      href: `/crm/deals/${d.id}`,
      score: 0,
    }));
  }

  private async fallbackSearchQuotes(
    orgId: string,
    q: string,
    limit: number,
  ): Promise<SearchResult[]> {
    const results = await this.prisma.quote.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        OR: [
          { quoteNumber: { contains: q, mode: 'insensitive' } },
          { customer: { name: { contains: q, mode: 'insensitive' } } },
        ],
      },
      select: { id: true, quoteNumber: true, customer: { select: { name: true } } },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
    return results.map((qt) => ({
      id: qt.id,
      type: 'quote',
      title: qt.quoteNumber,
      subtitle: qt.customer?.name,
      href: `/sales/quotes/${qt.id}`,
      score: 0,
    }));
  }

  private async fallbackSearchExpenses(
    orgId: string,
    q: string,
    limit: number,
  ): Promise<SearchResult[]> {
    const results = await this.prisma.expense.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        OR: [
          { description: { contains: q, mode: 'insensitive' } },
          { reference: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, description: true, reference: true, vendor: { select: { name: true } } },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
    return results.map((e) => ({
      id: e.id,
      type: 'expense',
      title: e.description ?? e.reference ?? 'Expense',
      subtitle: e.vendor?.name ?? undefined,
      href: `/purchases/expenses/${e.id}`,
      score: 0,
    }));
  }
}
