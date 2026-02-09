import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DeepSearchStatus, SuggestionCategory } from '@prisma/client';
import * as puppeteer from 'puppeteer';
import * as natural from 'natural';
import * as fs from 'fs/promises';
import * as path from 'path';

interface WebSource {
  source: string;
  url: string;
  content: string;
  features: string[];
}

interface CodebaseProfile {
  models: string[];
  aiFeatures: string[];
  modules: string[];
  dependencies: string[];
  routes: string[];
  existingFeatures: string[];
}

interface GapItem {
  term: string;
  category: SuggestionCategory;
  webFrequency: number;
  competitorCount: number;
  title: string;
  description: string;
  impact: string;
  effort: string;
  tags: string[];
  webSources: string[];
  codeFiles: string[];
}

// Curated ERP knowledge base for gap detection
const ERP_FEATURE_CATALOG: Record<SuggestionCategory, Array<{
  keyword: string;
  title: string;
  description: string;
  tags: string[];
  impact: string;
  effort: string;
}>> = {
  FEATURE_GAP: [
    { keyword: 'multi-currency', title: 'Multi-Currency Support', description: 'Enable transactions in multiple currencies with automatic exchange rate conversion and unrealized gain/loss tracking. Essential for businesses operating internationally.', tags: ['accounting', 'invoicing', 'global'], impact: 'HIGH', effort: 'HIGH' },
    { keyword: 'approval-workflow', title: 'Approval Workflow Engine', description: 'Configurable multi-step approval workflows for invoices, bills, purchase orders, and expenses. Support sequential and parallel approval chains with role-based routing.', tags: ['workflow', 'automation', 'compliance'], impact: 'HIGH', effort: 'HIGH' },
    { keyword: 'purchase-order', title: 'Purchase Order Management', description: 'Full purchase order lifecycle: create PO, send to vendor, track delivery, auto-convert to bill on receipt. Link POs to inventory and budgets.', tags: ['purchases', 'inventory', 'procurement'], impact: 'HIGH', effort: 'MEDIUM' },
    { keyword: 'budget-management', title: 'Budget Management Module', description: 'Create annual/quarterly budgets per account or department. Track budget vs actual in real-time with variance alerts. Support rolling forecasts.', tags: ['accounting', 'planning', 'reporting'], impact: 'HIGH', effort: 'MEDIUM' },
    { keyword: 'recurring-expense', title: 'Recurring Expense Automation', description: 'Auto-create expenses on a schedule (rent, subscriptions, utilities). Pre-fill from templates with smart date adjustment.', tags: ['expenses', 'automation'], impact: 'MEDIUM', effort: 'LOW' },
    { keyword: 'e-invoicing', title: 'E-Invoicing / ZATCA Compliance', description: 'Generate XML e-invoices compliant with ZATCA Phase 2 (Saudi Arabia) and Peppol (EU). Support QR codes, digital signatures, and clearance portal integration.', tags: ['invoicing', 'compliance', 'saudi'], impact: 'HIGH', effort: 'HIGH' },
    { keyword: 'document-management', title: 'Document Management System', description: 'Attach files to any record (invoices, bills, expenses). Support versioning, tagging, full-text search, and automatic OCR indexing of uploaded documents.', tags: ['documents', 'storage', 'search'], impact: 'MEDIUM', effort: 'MEDIUM' },
    { keyword: 'customer-portal', title: 'Customer Self-Service Portal', description: 'Allow customers to view invoices, make payments, download statements, and raise disputes through a branded web portal.', tags: ['customers', 'payments', 'self-service'], impact: 'HIGH', effort: 'HIGH' },
    { keyword: 'vendor-portal', title: 'Vendor Self-Service Portal', description: 'Allow vendors to submit invoices, track payment status, update bank details, and communicate through a secure portal.', tags: ['vendors', 'procurement', 'self-service'], impact: 'MEDIUM', effort: 'HIGH' },
    { keyword: 'bank-feeds', title: 'Automatic Bank Feeds Integration', description: 'Connect directly to banks via Open Banking/Plaid APIs to auto-import transactions daily. Reduce manual data entry by 80%.', tags: ['banking', 'automation', 'integration'], impact: 'HIGH', effort: 'HIGH' },
    { keyword: 'fixed-asset', title: 'Fixed Asset Register & Depreciation', description: 'Track fixed assets with purchase, depreciation schedules (straight-line, declining balance, units-of-production), disposal, and revaluation.', tags: ['accounting', 'assets'], impact: 'MEDIUM', effort: 'MEDIUM' },
    { keyword: 'inter-company', title: 'Inter-Company Transactions', description: 'Handle transactions between related entities/branches with automatic elimination entries for consolidated reporting.', tags: ['accounting', 'multi-entity'], impact: 'MEDIUM', effort: 'HIGH' },
    { keyword: 'project-costing', title: 'Project Costing & Profitability', description: 'Track labor, materials, and overhead costs per project. Calculate WIP, recognized revenue, and project profitability in real-time.', tags: ['projects', 'costing', 'reporting'], impact: 'MEDIUM', effort: 'MEDIUM' },
    { keyword: 'warehouse-barcode', title: 'Barcode/QR Scanning for Warehouse', description: 'Scan barcodes or QR codes for receiving, picking, and cycle counting. Support mobile devices and USB scanners.', tags: ['inventory', 'warehouse', 'mobile'], impact: 'MEDIUM', effort: 'MEDIUM' },
    { keyword: 'batch-serial', title: 'Batch & Serial Number Tracking', description: 'Track items by batch or serial number through the entire supply chain. Support expiry dates, recalls, and traceability.', tags: ['inventory', 'compliance', 'tracking'], impact: 'MEDIUM', effort: 'MEDIUM' },
    { keyword: 'custom-reports', title: 'Custom Report Builder', description: 'Drag-and-drop report builder for creating custom financial and operational reports. Save templates, schedule emails, export to PDF/Excel.', tags: ['reporting', 'analytics'], impact: 'HIGH', effort: 'HIGH' },
    { keyword: 'audit-trail-export', title: 'Comprehensive Audit Trail Export', description: 'Export complete audit trail for any entity or time period. Support compliance requirements (SOX, IFRS, local regulations).', tags: ['compliance', 'auditing'], impact: 'MEDIUM', effort: 'LOW' },
    { keyword: 'email-templates', title: 'Customizable Email Templates', description: 'Design branded email templates for invoices, quotes, reminders, and receipts. Support variables, conditional blocks, and multilingual content.', tags: ['communication', 'branding'], impact: 'MEDIUM', effort: 'MEDIUM' },
  ],
  PERFORMANCE_UX: [
    { keyword: 'real-time-dashboard', title: 'Real-Time Dashboard with WebSocket', description: 'Push real-time updates to the dashboard via WebSocket/SSE. Show live transaction feeds, cash position, and alerts without page refresh.', tags: ['dashboard', 'real-time', 'performance'], impact: 'HIGH', effort: 'MEDIUM' },
    { keyword: 'keyboard-shortcuts', title: 'Keyboard Shortcuts & Power User Mode', description: 'Add global keyboard shortcuts for common actions (Cmd+N for new invoice, Cmd+/ for search). Include a command palette (Cmd+K) for quick navigation.', tags: ['ux', 'productivity'], impact: 'MEDIUM', effort: 'LOW' },
    { keyword: 'bulk-operations', title: 'Bulk Operations UI', description: 'Select multiple records and perform batch operations: bulk approve, bulk pay, bulk delete, bulk export. Show progress for long-running operations.', tags: ['ux', 'productivity'], impact: 'HIGH', effort: 'MEDIUM' },
    { keyword: 'offline-mode', title: 'Offline Mode with Service Worker', description: 'Cache key pages and data for offline access. Queue mutations and sync when connection is restored. Essential for mobile/field users.', tags: ['pwa', 'mobile', 'reliability'], impact: 'MEDIUM', effort: 'HIGH' },
    { keyword: 'dark-mode', title: 'Dark Mode Theme', description: 'Full dark mode support across all pages. Persist preference, auto-detect system theme, and ensure proper contrast ratios for accessibility.', tags: ['ux', 'accessibility', 'theming'], impact: 'LOW', effort: 'LOW' },
    { keyword: 'table-virtualization', title: 'Virtualized Data Tables', description: 'Use virtual scrolling for large datasets (10k+ rows). Implement column resizing, sorting, filtering, and export without loading all data into DOM.', tags: ['performance', 'ux', 'tables'], impact: 'HIGH', effort: 'MEDIUM' },
    { keyword: 'progressive-loading', title: 'Progressive Loading & Skeleton Screens', description: 'Replace loading spinners with skeleton screens that match the actual content layout. Implement progressive data loading for complex pages.', tags: ['ux', 'performance'], impact: 'MEDIUM', effort: 'LOW' },
    { keyword: 'responsive-mobile', title: 'Responsive Mobile-First Redesign', description: 'Optimize all pages for mobile screens (375px+). Implement bottom navigation, swipe gestures, and touch-friendly controls.', tags: ['mobile', 'responsive', 'ux'], impact: 'HIGH', effort: 'HIGH' },
    { keyword: 'accessibility-wcag', title: 'WCAG 2.1 AA Compliance', description: 'Ensure all components meet WCAG 2.1 AA standards. Add ARIA labels, keyboard navigation, focus management, and screen reader support.', tags: ['accessibility', 'compliance'], impact: 'MEDIUM', effort: 'MEDIUM' },
    { keyword: 'search-global', title: 'Global Search with Fuzzy Matching', description: 'Implement a global search bar that searches across all entities (invoices, customers, items, etc.) with fuzzy matching and recent history.', tags: ['ux', 'search', 'productivity'], impact: 'HIGH', effort: 'MEDIUM' },
    { keyword: 'api-caching', title: 'API Response Caching Layer', description: 'Add Redis caching for frequently accessed endpoints (account balances, dashboards, reports). Implement cache invalidation on writes.', tags: ['performance', 'caching'], impact: 'HIGH', effort: 'MEDIUM' },
    { keyword: 'database-optimization', title: 'Database Query Optimization', description: 'Analyze and optimize slow queries. Add composite indexes, implement connection pooling, use read replicas for reports.', tags: ['performance', 'database'], impact: 'HIGH', effort: 'MEDIUM' },
  ],
  AI_CAPABILITY: [
    { keyword: 'smart-categorization-v2', title: 'Context-Aware Transaction Categorization', description: 'Upgrade categorization to consider transaction context (vendor history, time patterns, amount clusters). Use ensemble of classifiers for higher accuracy.', tags: ['ai', 'categorization', 'ml'], impact: 'HIGH', effort: 'MEDIUM' },
    { keyword: 'natural-language-query', title: 'Natural Language Query Interface', description: 'Allow users to ask questions in plain English: "How much did we spend on office supplies last quarter?" Parse intent, generate Prisma queries, return formatted results.', tags: ['ai', 'nlp', 'query'], impact: 'HIGH', effort: 'HIGH' },
    { keyword: 'receipt-auto-entry', title: 'Receipt Photo to Expense Entry', description: 'Snap a photo of a receipt, auto-extract merchant, amount, date, and category. Create expense entry with one tap. Use OCR + NLP pipeline.', tags: ['ai', 'ocr', 'mobile'], impact: 'HIGH', effort: 'MEDIUM' },
    { keyword: 'cash-flow-scenario', title: 'Cash Flow Scenario Modeling', description: 'Run what-if scenarios: "What if we delay payments by 15 days?" "What if revenue drops 20%?" Visualize impact on cash position over time.', tags: ['ai', 'forecasting', 'planning'], impact: 'HIGH', effort: 'MEDIUM' },
    { keyword: 'smart-invoice-reminder', title: 'AI-Powered Payment Reminder Optimization', description: 'Use ML to determine the optimal time, channel, and tone for payment reminders. Learn from customer payment behavior to maximize collection rates.', tags: ['ai', 'collections', 'automation'], impact: 'HIGH', effort: 'MEDIUM' },
    { keyword: 'anomaly-explanation', title: 'Anomaly Explanation Engine', description: 'When anomalies are detected, auto-generate human-readable explanations of why each anomaly was flagged and suggest corrective actions.', tags: ['ai', 'anomaly', 'nlp'], impact: 'MEDIUM', effort: 'MEDIUM' },
    { keyword: 'predictive-inventory', title: 'Predictive Inventory Optimization', description: 'Combine demand forecasting with lead time prediction and cost optimization to suggest optimal order quantities and timing per SKU.', tags: ['ai', 'inventory', 'optimization'], impact: 'HIGH', effort: 'HIGH' },
    { keyword: 'smart-reconciliation', title: 'Self-Learning Bank Reconciliation', description: 'Learn from user reconciliation patterns to improve matching accuracy over time. Handle partial matches, split transactions, and multi-to-one matching.', tags: ['ai', 'banking', 'reconciliation'], impact: 'HIGH', effort: 'MEDIUM' },
    { keyword: 'document-understanding', title: 'Document Understanding Pipeline', description: 'Extract structured data from any document type (contracts, purchase orders, delivery notes). Build document-type-specific extraction models that improve with training.', tags: ['ai', 'ocr', 'nlp'], impact: 'HIGH', effort: 'HIGH' },
    { keyword: 'revenue-forecasting', title: 'ML Revenue Forecasting', description: 'Predict future revenue using historical patterns, seasonal trends, pipeline data, and external factors. Provide confidence intervals and driver analysis.', tags: ['ai', 'forecasting', 'revenue'], impact: 'HIGH', effort: 'MEDIUM' },
    { keyword: 'expense-policy', title: 'AI Expense Policy Enforcement', description: 'Automatically check expenses against company policies (per diem limits, category restrictions, duplicate detection). Flag violations before approval.', tags: ['ai', 'expenses', 'compliance'], impact: 'MEDIUM', effort: 'MEDIUM' },
    { keyword: 'vendor-risk-scoring', title: 'Vendor Risk Scoring', description: 'Score vendors based on payment reliability, price competitiveness, delivery performance, and financial stability. Alert on high-risk vendor relationships.', tags: ['ai', 'vendors', 'risk'], impact: 'MEDIUM', effort: 'MEDIUM' },
  ],
};

// Keywords to detect existing features in codebase
const FEATURE_DETECTION_KEYWORDS: Record<string, string[]> = {
  'multi-currency': ['exchangeRate', 'currency', 'multi-currency', 'forex', 'fx'],
  'approval-workflow': ['approval', 'workflow', 'approver', 'approvalChain'],
  'purchase-order': ['purchaseOrder', 'PurchaseOrder', 'purchase_orders'],
  'budget-management': ['budget', 'Budget', 'budgets', 'variance'],
  'recurring-expense': ['recurringExpense', 'recurring_expense'],
  'e-invoicing': ['zatca', 'einvoice', 'peppol', 'xml-invoice'],
  'document-management': ['documentStorage', 'fileAttachment', 'document_management'],
  'customer-portal': ['customerPortal', 'customer-portal', 'self-service'],
  'vendor-portal': ['vendorPortal', 'vendor-portal'],
  'bank-feeds': ['bankFeed', 'plaid', 'openBanking', 'bank_feeds'],
  'fixed-asset': ['fixedAsset', 'depreciation', 'DepreciationSchedule'],
  'inter-company': ['interCompany', 'inter_company', 'consolidation'],
  'project-costing': ['projectCost', 'project_costing', 'wip'],
  'warehouse-barcode': ['barcode', 'qrCode', 'scanner'],
  'batch-serial': ['batchNumber', 'serialNumber', 'batch_tracking'],
  'custom-reports': ['reportBuilder', 'customReport', 'report_builder'],
  'audit-trail-export': ['auditExport', 'audit_trail_export'],
  'email-templates': ['emailTemplate', 'email_templates'],
  'real-time-dashboard': ['websocket', 'sse', 'server-sent-events', 'real-time'],
  'keyboard-shortcuts': ['keyboardShortcut', 'commandPalette', 'hotkey'],
  'bulk-operations': ['bulkOperation', 'bulk_operations', 'batchAction'],
  'offline-mode': ['serviceWorker', 'offline', 'sw.js'],
  'dark-mode': ['darkMode', 'dark-mode', 'theme-toggle'],
  'table-virtualization': ['virtualized', 'virtual-scroll', 'tanstack-virtual'],
  'progressive-loading': ['skeleton', 'Skeleton', 'progressive'],
  'responsive-mobile': ['mobile-nav', 'bottomNavigation'],
  'accessibility-wcag': ['aria-label', 'wcag', 'a11y'],
  'search-global': ['globalSearch', 'global-search', 'commandPalette'],
  'api-caching': ['cacheManager', 'CacheModule', 'redis-cache'],
  'database-optimization': ['readReplica', 'connectionPool', 'pgbouncer'],
  'smart-categorization-v2': ['ensembleClassifier', 'contextCategorization'],
  'natural-language-query': ['naturalLanguageQuery', 'nlq', 'questionParser'],
  'receipt-auto-entry': ['receiptScan', 'receipt-entry', 'mobileOcr'],
  'cash-flow-scenario': ['cashFlowScenario', 'whatIf', 'scenarioModel'],
  'smart-invoice-reminder': ['reminderOptimization', 'smartReminder'],
  'anomaly-explanation': ['anomalyExplanation', 'explainAnomaly'],
  'predictive-inventory': ['inventoryOptimization', 'orderQuantity'],
  'smart-reconciliation': ['selfLearningReconciliation', 'matchLearning'],
  'document-understanding': ['documentUnderstanding', 'docPipeline'],
  'revenue-forecasting': ['revenueForecast', 'revenuePredict'],
  'expense-policy': ['expensePolicy', 'policyEnforcement'],
  'vendor-risk-scoring': ['vendorRisk', 'vendorScore'],
};

@Injectable()
export class DeepSearchService {
  private readonly logger = new Logger(DeepSearchService.name);
  private readonly projectRoot = path.resolve(__dirname, '../../../../..');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Main entry point: starts an async deep search job.
   * Returns the job immediately; the pipeline runs in the background.
   */
  async runSearch(
    organizationId: string,
    options?: { skipWeb?: boolean; categories?: string[]; maxSuggestions?: number },
  ) {
    const job = await this.prisma.deepSearchJob.create({
      data: { organizationId, status: 'PENDING', progress: 0 },
    });

    // Fire and forget - pipeline runs asynchronously
    this.executePipeline(job.id, organizationId, options).catch((err) => {
      this.logger.error(`DeepSearch pipeline failed for job ${job.id}: ${err.message}`, err.stack);
    });

    return job;
  }

  async getJobs(organizationId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [jobs, total] = await Promise.all([
      this.prisma.deepSearchJob.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { suggestions: { orderBy: { priority: 'desc' } } },
      }),
      this.prisma.deepSearchJob.count({ where: { organizationId } }),
    ]);
    return { data: jobs, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getJob(organizationId: string, jobId: string) {
    return this.prisma.deepSearchJob.findFirst({
      where: { id: jobId, organizationId },
      include: { suggestions: { orderBy: { priority: 'desc' } } },
    });
  }

  async updateSuggestionStatus(organizationId: string, suggestionId: string, status: string) {
    return this.prisma.deepSearchSuggestion.updateMany({
      where: { id: suggestionId, organizationId },
      data: { status },
    });
  }

  async getSuggestionPrompt(organizationId: string, suggestionId: string) {
    const suggestion = await this.prisma.deepSearchSuggestion.findFirst({
      where: { id: suggestionId, organizationId },
      select: { prompt: true, title: true, category: true },
    });
    return suggestion;
  }

  // ─── Private Pipeline Methods ───────────────────────────────────────────

  private async executePipeline(
    jobId: string,
    organizationId: string,
    options?: { skipWeb?: boolean; categories?: string[]; maxSuggestions?: number },
  ) {
    const maxSuggestions = options?.maxSuggestions ?? 15;
    const categories = options?.categories?.map((c) => c as SuggestionCategory);

    try {
      await this.updateJob(jobId, { status: 'SCRAPING', progress: 5, startedAt: new Date(), progressMessage: 'Starting web research...' });

      // Phase 1: Web Scraping
      let webSources: WebSource[] = [];
      if (!options?.skipWeb) {
        webSources = await this.scrapeWebSources();
        await this.updateJob(jobId, { progress: 35, webSourcesScraped: webSources.length, progressMessage: 'Web scraping complete. Analyzing codebase...' });
      } else {
        await this.updateJob(jobId, { progress: 35, progressMessage: 'Skipped web scraping. Analyzing codebase...' });
      }

      // Phase 2: Codebase Analysis
      await this.updateJob(jobId, { status: 'ANALYZING', progress: 40, progressMessage: 'Reading project files...' });
      const codebaseProfile = await this.analyzeCodebase();
      await this.updateJob(jobId, {
        progress: 55,
        codeFilesAnalyzed: codebaseProfile.models.length + codebaseProfile.modules.length + codebaseProfile.dependencies.length,
        progressMessage: 'Codebase analyzed. Running gap analysis...',
      });

      // Phase 3: NLP Gap Analysis
      const gaps = this.performGapAnalysis(webSources, codebaseProfile, categories);
      await this.updateJob(jobId, { progress: 70, progressMessage: `Found ${gaps.length} potential enhancements. Generating suggestions...` });

      // Phase 4 & 5: Generate Suggestions with Prompts
      await this.updateJob(jobId, { status: 'GENERATING', progress: 75, progressMessage: 'Generating enhancement suggestions and prompts...' });

      const topGaps = gaps.slice(0, maxSuggestions);
      const suggestions = topGaps.map((gap) => ({
        category: gap.category,
        title: gap.title,
        description: gap.description,
        impact: gap.impact,
        effort: gap.effort,
        priority: this.computePriority(gap),
        tags: gap.tags,
        sources: { web: gap.webSources, codeFiles: gap.codeFiles },
        prompt: this.generatePrompt(gap, codebaseProfile),
        organizationId,
        jobId,
      }));

      if (suggestions.length > 0) {
        await this.prisma.deepSearchSuggestion.createMany({ data: suggestions });
      }

      await this.updateJob(jobId, {
        status: 'COMPLETED',
        progress: 100,
        suggestionsCount: suggestions.length,
        completedAt: new Date(),
        progressMessage: `Done! Generated ${suggestions.length} enhancement suggestions.`,
      });
    } catch (error) {
      this.logger.error(`Pipeline error for job ${jobId}: ${error.message}`, error.stack);
      await this.updateJob(jobId, {
        status: 'FAILED',
        error: error.message,
        progressMessage: `Failed: ${error.message}`,
      });
    }
  }

  private async updateJob(jobId: string, data: Record<string, any>) {
    await this.prisma.deepSearchJob.update({ where: { id: jobId }, data });
  }

  // ─── Phase 1: Web Scraping ──────────────────────────────────────────────

  private async scrapeWebSources(): Promise<WebSource[]> {
    const sources: WebSource[] = [];
    let browser: puppeteer.Browser | null = null;

    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });

      const targets = [
        { url: 'https://github.com/topics/erp?o=desc&s=stars', source: 'GitHub ERP Repos' },
        { url: 'https://github.com/topics/accounting-software?o=desc&s=stars', source: 'GitHub Accounting Repos' },
        { url: 'https://github.com/topics/invoice?o=desc&s=stars', source: 'GitHub Invoice Repos' },
        { url: 'https://www.npmjs.com/search?q=erp%20accounting&ranking=popularity', source: 'npm ERP Packages' },
      ];

      for (const target of targets) {
        try {
          const page = await browser.newPage();
          await page.setUserAgent('Mozilla/5.0 (compatible; MizanoDeepSearch/1.0)');
          await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 15000 });

          const textContent = await page.evaluate(() => {
            // Extract meaningful text, skip nav/footer
            const main = document.querySelector('main') || document.body;
            return main.innerText.substring(0, 10000);
          });

          const features = this.extractFeaturesFromText(textContent);
          sources.push({
            source: target.source,
            url: target.url,
            content: textContent.substring(0, 3000),
            features,
          });

          await page.close();
          // Rate limit: 2s between requests
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } catch (err) {
          this.logger.warn(`Failed to scrape ${target.source}: ${err.message}`);
        }
      }
    } catch (err) {
      this.logger.warn(`Browser launch failed: ${err.message}. Continuing with codebase-only analysis.`);
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }

    return sources;
  }

  private extractFeaturesFromText(text: string): string[] {
    const featurePatterns = [
      /multi[- ]?currency/gi,
      /approval[- ]?workflow/gi,
      /purchase[- ]?order/gi,
      /budget[- ]?management/gi,
      /e[- ]?invoic/gi,
      /bank[- ]?feed/gi,
      /real[- ]?time/gi,
      /offline[- ]?mode/gi,
      /dark[- ]?mode/gi,
      /barcode|qr[- ]?code/gi,
      /batch[- ]?tracking|serial[- ]?number/gi,
      /report[- ]?builder|custom[- ]?report/gi,
      /machine[- ]?learning|ml|ai[- ]?powered/gi,
      /natural[- ]?language/gi,
      /receipt[- ]?scan/gi,
      /forecast/gi,
      /anomaly[- ]?detection/gi,
      /reconciliation/gi,
      /document[- ]?management/gi,
      /customer[- ]?portal/gi,
      /vendor[- ]?portal/gi,
      /mobile[- ]?app|responsive/gi,
      /websocket|real-time|sse/gi,
      /keyboard[- ]?shortcut|command[- ]?palette/gi,
      /bulk[- ]?operation/gi,
      /accessibility|wcag|a11y/gi,
      /scenario[- ]?modeling|what[- ]?if/gi,
      /vendor[- ]?risk/gi,
      /expense[- ]?policy/gi,
      /revenue[- ]?forecast/gi,
    ];

    const found = new Set<string>();
    for (const pattern of featurePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        found.add(matches[0].toLowerCase().replace(/\s+/g, '-'));
      }
    }

    return Array.from(found);
  }

  // ─── Phase 2: Codebase Analysis ─────────────────────────────────────────

  private async analyzeCodebase(): Promise<CodebaseProfile> {
    const profile: CodebaseProfile = {
      models: [],
      aiFeatures: [],
      modules: [],
      dependencies: [],
      routes: [],
      existingFeatures: [],
    };

    // 1. Parse Prisma schema for model names
    try {
      const schemaPath = path.join(this.projectRoot, 'prisma/schema.prisma');
      const schema = await fs.readFile(schemaPath, 'utf-8');
      const modelMatches = schema.match(/^model\s+(\w+)\s*\{/gm) || [];
      profile.models = modelMatches.map((m) => m.replace(/^model\s+/, '').replace(/\s*\{$/, ''));

      // Also extract enum names for additional context
      const enumMatches = schema.match(/^enum\s+(\w+)\s*\{/gm) || [];
      const enums = enumMatches.map((e) => e.replace(/^enum\s+/, '').replace(/\s*\{$/, ''));
      profile.existingFeatures.push(...enums.map((e) => e.toLowerCase()));
    } catch {
      this.logger.warn('Could not read Prisma schema');
    }

    // 2. Read AI module registration
    try {
      const aiModulePath = path.join(this.projectRoot, 'src/modules/ai/ai.module.ts');
      const aiModule = await fs.readFile(aiModulePath, 'utf-8');
      const serviceMatches = aiModule.match(/(\w+Service)/g) || [];
      profile.aiFeatures = [...new Set(serviceMatches)];
    } catch {
      this.logger.warn('Could not read AI module');
    }

    // 3. Read package.json dependencies
    try {
      const pkgPath = path.join(this.projectRoot, 'package.json');
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
      profile.dependencies = [
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.devDependencies || {}),
      ];
    } catch {
      this.logger.warn('Could not read package.json');
    }

    // 4. List business modules
    try {
      const modulesDir = path.join(this.projectRoot, 'src/modules');
      const dirs = await fs.readdir(modulesDir, { withFileTypes: true });
      profile.modules = dirs.filter((d) => d.isDirectory()).map((d) => d.name);
    } catch {
      this.logger.warn('Could not read modules directory');
    }

    // 5. Detect which features from our catalog already exist
    const allCodeText = [
      ...profile.models,
      ...profile.aiFeatures,
      ...profile.modules,
      ...profile.dependencies,
    ].join(' ');

    for (const [featureKey, keywords] of Object.entries(FEATURE_DETECTION_KEYWORDS)) {
      const isPresent = keywords.some((kw) => allCodeText.includes(kw));
      if (isPresent) {
        profile.existingFeatures.push(featureKey);
      }
    }

    return profile;
  }

  // ─── Phase 3: NLP Gap Analysis ──────────────────────────────────────────

  private performGapAnalysis(
    webSources: WebSource[],
    codebaseProfile: CodebaseProfile,
    categoryFilter?: SuggestionCategory[],
  ): GapItem[] {
    const gaps: GapItem[] = [];

    // Build a combined web corpus for TF-IDF analysis
    const tfidf = new natural.TfIdf();
    for (const source of webSources) {
      tfidf.addDocument(source.content);
    }

    // Extract trending terms from web
    const webFeatureFreq = new Map<string, number>();
    for (const source of webSources) {
      for (const feature of source.features) {
        webFeatureFreq.set(feature, (webFeatureFreq.get(feature) || 0) + 1);
      }
    }

    // Check each feature in catalog against existing features
    const allCategories = categoryFilter || ['FEATURE_GAP', 'PERFORMANCE_UX', 'AI_CAPABILITY'] as SuggestionCategory[];

    for (const category of allCategories) {
      const catalog = ERP_FEATURE_CATALOG[category] || [];
      for (const feature of catalog) {
        // Skip if already exists in codebase
        if (codebaseProfile.existingFeatures.includes(feature.keyword)) {
          continue;
        }

        // Calculate web frequency boost
        let webFrequency = 0;
        let competitorCount = 0;
        const relatedWebSources: string[] = [];

        for (const source of webSources) {
          const normalized = source.content.toLowerCase();
          if (normalized.includes(feature.keyword.replace(/-/g, ' ')) || normalized.includes(feature.keyword)) {
            webFrequency++;
            competitorCount++;
            relatedWebSources.push(source.url);
          }
        }

        // Also check TF-IDF relevance
        const keywordTerms = feature.keyword.split('-');
        let tfidfScore = 0;
        for (const term of keywordTerms) {
          tfidf.tfidfs(term, (docIndex, measure) => {
            tfidfScore += measure;
          });
        }

        // Find related code files
        const relatedCodeFiles: string[] = [];
        for (const mod of codebaseProfile.modules) {
          const tagMatch = feature.tags.some((tag) => mod.toLowerCase().includes(tag));
          if (tagMatch) {
            relatedCodeFiles.push(`src/modules/${mod}/`);
          }
        }

        gaps.push({
          term: feature.keyword,
          category,
          webFrequency: webFrequency + (tfidfScore > 0 ? 1 : 0),
          competitorCount,
          title: feature.title,
          description: feature.description,
          impact: feature.impact,
          effort: feature.effort,
          tags: feature.tags,
          webSources: relatedWebSources,
          codeFiles: relatedCodeFiles,
        });
      }
    }

    // Sort by a combined priority score
    gaps.sort((a, b) => this.computePriority(b) - this.computePriority(a));

    return gaps;
  }

  private computePriority(gap: GapItem): number {
    const impactScore = gap.impact === 'HIGH' ? 3 : gap.impact === 'MEDIUM' ? 2 : 1;
    const effortScore = gap.effort === 'LOW' ? 3 : gap.effort === 'MEDIUM' ? 2 : 1;
    const webBoost = Math.min(gap.webFrequency * 0.5, 2);
    const competitorBoost = Math.min(gap.competitorCount * 0.3, 1.5);

    const raw = (impactScore * 2) + effortScore + webBoost + competitorBoost;
    return Math.min(Math.round(raw), 10);
  }

  // ─── Phase 5: Prompt Generation ─────────────────────────────────────────

  private generatePrompt(gap: GapItem, codebaseProfile: CodebaseProfile): string {
    const relatedModules = codebaseProfile.modules
      .filter((mod) => gap.tags.some((tag) => mod.toLowerCase().includes(tag)))
      .map((mod) => `apps/api/src/modules/${mod}/`)
      .join('\n  - ') || 'TBD based on analysis';

    const relatedModels = codebaseProfile.models
      .filter((model) => {
        const modelLower = model.toLowerCase();
        return gap.tags.some((tag) => modelLower.includes(tag));
      })
      .join(', ') || 'None directly related';

    const webContext = gap.webSources.length > 0
      ? `\nThis feature was found in ${gap.webSources.length} competing ERP systems/projects, indicating strong market demand.`
      : '';

    return `I need you to implement "${gap.title}" for the Mizano ERP system.

## Context
${gap.description}${webContext}

## Current State
- Existing related modules: ${relatedModules}
- Related database models: ${relatedModels}
- Current AI features: ${codebaseProfile.aiFeatures.length} services registered
- Tech stack: NestJS backend, Next.js 14 frontend, Prisma ORM, PostgreSQL

## Requirements
- Follow existing patterns: multi-tenancy (organizationId on all queries), JwtAuthGuard + PermissionsGuard
- Backend: NestJS service + controller + DTOs with Swagger decorators
- Frontend: Next.js page + React Query hook + shadcn/ui components
- All AI must remain 100% local (use natural, brain.js, ml-* libraries, NOT external APIs)
- Include proper error handling, loading states, and empty states
- Use Decimal for any monetary values
- Ensure mobile responsiveness

## Suggested File Structure
- Backend service: apps/api/src/modules/{module}/{feature}.service.ts
- Backend controller: apps/api/src/modules/{module}/{feature}.controller.ts
- Backend DTOs: apps/api/src/modules/{module}/dto/{feature}.dto.ts
- Frontend page: apps/web/app/[locale]/(dashboard)/{route}/page.tsx
- Frontend hook: apps/web/lib/hooks/use-{feature}.ts
- Schema changes: apps/api/prisma/schema.prisma

## Tags
${gap.tags.join(', ')}

## Acceptance Criteria
- [ ] Backend endpoint(s) working with proper auth guards
- [ ] Frontend page renders with loading, error, and empty states
- [ ] organizationId included in all database queries
- [ ] TypeScript strict mode - no \`any\` types
- [ ] Responsive on mobile (375px+)
- [ ] Follows existing code patterns in the repository`;
  }
}
