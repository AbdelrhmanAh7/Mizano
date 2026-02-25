import { Injectable, Logger } from '@nestjs/common';
import { AiFeature } from '@prisma/client';
import { AiTrainingService } from './ai-training.service';

interface TrainingRecord {
  inputData: Record<string, any>;
  label: string;
}

@Injectable()
export class AiTrainingDataGeneratorService {
  private readonly logger = new Logger(AiTrainingDataGeneratorService.name);

  constructor(private trainingService: AiTrainingService) {}

  async generate(
    organizationId: string,
    feature: AiFeature,
    count: number = 100,
  ): Promise<{ inserted: number; feature: AiFeature; sampleCount: number }> {
    this.logger.log(`Generating ${count} training samples for ${feature}`);
    const records = this.generateRecords(feature, count);
    const result = await this.trainingService.seedTrainingData(organizationId, feature, records);
    this.logger.log(`Inserted ${result.inserted} records for ${feature}`);
    return { inserted: result.inserted, feature, sampleCount: count };
  }

  private generateRecords(feature: AiFeature, count: number): TrainingRecord[] {
    switch (feature) {
      case 'CATEGORIZATION':
        return this.genCategorization(count);
      case 'RECONCILIATION':
        return this.genReconciliation(count);
      case 'OCR_LAYOUT':
        return this.genOcrLayout(count);
      case 'DEMAND_FORECAST':
        return this.genDemandForecast(count);
      case 'LEAD_SCORING':
        return this.genLeadScoring(count);
      case 'ANOMALY':
        return this.genAnomaly(count);
      case 'REORDER':
        return this.genReorder(count);
      case 'PAYMENT_PREDICTION':
        return this.genPaymentPrediction(count);
      case 'CASH_FLOW':
        return this.genCashFlow(count);
      case 'PATTERN_DETECTION':
        return this.genPatternDetection(count);
      case 'CHURN_PREDICTION':
        return this.genChurnPrediction(count);
      case 'CLV_ANALYSIS':
        return this.genClvAnalysis(count);
      case 'CROSS_SELL':
        return this.genCrossSell(count);
      case 'DYNAMIC_PRICING':
        return this.genDynamicPricing(count);
      case 'PIPELINE_FORECAST':
        return this.genPipelineForecast(count);
      case 'FRAUD_DETECTION':
        return this.genFraudDetection(count);
      case 'COMPLIANCE_MONITORING':
        return this.genComplianceMonitoring(count);
      case 'AUDIT_RISK':
        return this.genAuditRisk(count);
      case 'DOCUMENT_CLASSIFICATION':
        return this.genDocumentClassification(count);
      case 'SENTIMENT_ANALYSIS':
        return this.genSentimentAnalysis(count);
      case 'ENTITY_EXTRACTION':
        return this.genEntityExtraction(count);
      case 'CONTRACT_ANALYSIS':
        return this.genContractAnalysis(count);
      case 'EMPLOYEE_ATTRITION':
        return this.genEmployeeAttrition(count);
      case 'COMPENSATION_BENCHMARK':
        return this.genCompensationBenchmark(count);
      case 'SKILLS_GAP':
        return this.genSkillsGap(count);
      case 'QUALITY_PREDICTION':
        return this.genQualityPrediction(count);
      case 'PREDICTIVE_MAINTENANCE':
        return this.genPredictiveMaintenance(count);
      case 'WORKFORCE_SCHEDULING':
        return this.genWorkforceScheduling(count);
      case 'ROUTE_OPTIMIZATION':
        return this.genRouteOptimization(count);
      case 'RESOURCE_OPTIMIZATION':
        return this.genResourceOptimization(count);
      case 'CHATBOT':
        return this.genChatbot(count);
      case 'KNOWLEDGE_ASSISTANT':
        return this.genKnowledgeAssistant(count);
      case 'VOICE_COMMAND':
        return this.genVoiceCommand(count);
      default:
        return this.genGeneric(feature, count);
    }
  }

  // ─── Helpers ─────────────────────────────────────────────

  private pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private randInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private randFloat(min: number, max: number, decimals = 2): number {
    return parseFloat((min + Math.random() * (max - min)).toFixed(decimals));
  }

  private normalRandom(mean: number, stdDev: number): number {
    const u = 1 - Math.random();
    const v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + z * stdDev;
  }

  // ─── Core Financial (10) ─────────────────────────────────

  private genCategorization(count: number): TrainingRecord[] {
    const categories = [
      {
        code: '6000',
        descriptions: [
          'Office supplies purchase',
          'Printer paper and toner',
          'Desk stationery order',
          'Filing supplies',
          'Office equipment small',
          'Keyboard and mouse set',
          'Whiteboard supplies',
          'Paper shredder',
        ],
        vendor: 'Staples Office Supply',
        range: [15, 500],
      },
      {
        code: '6100',
        descriptions: [
          'Monthly internet bill',
          'Electricity payment',
          'Water utility',
          'Phone service bill',
          'Internet fiber upgrade',
          'Gas bill office',
          'Heating charges',
          'Telecom bundle',
        ],
        vendor: 'Egypt Telecom',
        range: [50, 800],
      },
      {
        code: '6200',
        descriptions: [
          'Team lunch meeting',
          'Client dinner',
          'Office coffee supplies',
          'Catering quarterly',
          'Business lunch',
          'Staff celebration',
          'Snacks and beverages',
          'Client entertainment',
        ],
        vendor: 'Cairo Catering',
        range: [20, 2000],
      },
      {
        code: '6300',
        descriptions: [
          'Flight business trip',
          'Hotel accommodation',
          'Taxi expenses',
          'Airport transfer',
          'Train tickets',
          'Per diem travel',
          'Car rental',
          'Conference travel',
        ],
        vendor: 'EgyptAir',
        range: [100, 5000],
      },
      {
        code: '6400',
        descriptions: [
          'Google Ads spend',
          'Facebook advertising',
          'Brochure printing',
          'Trade show booth',
          'Social media management',
          'Email marketing tool',
          'SEO service',
          'Video production',
        ],
        vendor: 'Digital Marketing Pro',
        range: [200, 10000],
      },
      {
        code: '6500',
        descriptions: [
          'Business insurance premium',
          'Liability insurance',
          'Workers compensation',
          'Property insurance',
          'Health insurance staff',
          'Vehicle insurance',
          'Cyber insurance',
          'Equipment insurance',
        ],
        vendor: 'Nile Insurance',
        range: [500, 15000],
      },
      {
        code: '6600',
        descriptions: [
          'Monthly office rent',
          'Warehouse lease',
          'Parking rental',
          'Building maintenance',
          'Common area charges',
          'Equipment lease',
          'Storage unit',
          'Co-working space',
        ],
        vendor: 'Cairo Properties',
        range: [1000, 20000],
      },
      {
        code: '6700',
        descriptions: [
          'Legal consultation',
          'Annual audit fee',
          'Tax advisory quarterly',
          'Accounting retainer',
          'HR consulting',
          'IT consulting',
          'Contract review',
          'Business valuation',
        ],
        vendor: 'Baker McKenzie',
        range: [300, 25000],
      },
      {
        code: '5100',
        descriptions: [
          'Monthly payroll',
          'Salary engineering',
          'Overtime warehouse',
          'Staff bonus',
          'Commission sales',
          'Freelancer payment',
          'Part-time wages',
          'Salary adjustment',
        ],
        vendor: null,
        range: [1000, 50000],
      },
      {
        code: '5000',
        descriptions: [
          'Raw materials',
          'Wholesale inventory',
          'Packaging materials',
          'Manufacturing supplies',
          'Freight charges',
          'Import duties',
          'Component electronics',
          'Inventory restock',
        ],
        vendor: 'Supplier Alpha',
        range: [500, 30000],
      },
      {
        code: '4000',
        descriptions: [
          'Product sales order',
          'Service revenue consulting',
          'Subscription payment',
          'Project completion',
          'Hardware sales retail',
          'Software license',
          'Maintenance contract',
          'Installation service',
        ],
        vendor: null,
        range: [200, 50000],
      },
    ];

    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const cat = this.pick(categories);
      records.push({
        inputData: {
          description: this.pick(cat.descriptions) + ` #${this.randInt(100, 9999)}`,
          vendorName: cat.vendor,
          amount: this.randFloat(cat.range[0], cat.range[1]),
          direction: cat.code.startsWith('4') ? 'income' : 'expense',
        },
        label: cat.code,
      });
    }
    return records;
  }

  private genReconciliation(count: number): TrainingRecord[] {
    const patterns = [
      {
        templates: [
          'TRF FROM {company} REF {ref}',
          'DEPOSIT {company} PAYMENT',
          'WIRE IN FROM {company}',
          'ACH RECEIPT {company}',
          'CHQ DEP {company}',
        ],
        label: 'invoice',
        amountRange: [500, 15000] as [number, number],
      },
      {
        templates: [
          'PAYMENT TO {company}',
          'CHQ {ref} {company}',
          'TRF TO {company}',
          'WIRE OUT {company}',
          'DIRECT DEBIT {company}',
        ],
        label: 'bill',
        amountRange: [-15000, -500] as [number, number],
      },
      {
        templates: [
          'MONTHLY RENT PAYMENT',
          'STANDING ORDER RENT',
          'OFFICE RENT {month}',
          'LEASE PAYMENT',
        ],
        label: 'expense:rent',
        amountRange: [-12000, -3000] as [number, number],
      },
      {
        templates: [
          'ELECTRICITY BILL',
          'INTERNET SERVICE',
          'TELECOM DD',
          'UTILITY PAYMENT',
          'WATER BILL',
        ],
        label: 'expense:utilities',
        amountRange: [-1000, -50] as [number, number],
      },
      {
        templates: [
          'BANK FEE MONTHLY',
          'WIRE TRANSFER FEE',
          'ATM FEE',
          'SERVICE CHARGE',
          'CARD ANNUAL FEE',
        ],
        label: 'expense:bank_charges',
        amountRange: [-100, -5] as [number, number],
      },
      {
        templates: ['PAYROLL {month}', 'SALARY TRANSFER BATCH', 'WAGES PAYMENT', 'MONTHLY WAGES'],
        label: 'expense:payroll',
        amountRange: [-80000, -10000] as [number, number],
      },
      {
        templates: ['POS TXN {company}', 'CARD PURCHASE {company}', 'AMAZON PURCHASE'],
        label: 'expense:office_supplies',
        amountRange: [-1000, -20] as [number, number],
      },
      {
        templates: ['INSURANCE PREMIUM', 'INS PAYMENT QUARTERLY', 'INSURANCE DEDUCTIBLE'],
        label: 'expense:insurance',
        amountRange: [-10000, -500] as [number, number],
      },
      {
        templates: ['VAT PAYMENT', 'TAX AUTHORITY', 'INCOME TAX PAYMENT', 'WITHHOLDING TAX'],
        label: 'expense:tax',
        amountRange: [-20000, -500] as [number, number],
      },
      {
        templates: ['INTERNAL TRANSFER', 'TRF TO SAVINGS', 'TRF FROM SAVINGS', 'BETWEEN ACCOUNTS'],
        label: 'transfer:internal',
        amountRange: [-50000, 50000] as [number, number],
      },
      {
        templates: [
          'GOOGLE WORKSPACE',
          'SLACK BUSINESS',
          'AWS MONTHLY',
          'ADOBE SUBSCRIPTION',
          'ZOOM PRO',
        ],
        label: 'expense:subscriptions',
        amountRange: [-500, -10] as [number, number],
      },
      {
        templates: ['LOAN REPAYMENT', 'MORTGAGE INSTALLMENT', 'CREDIT LINE PAYMENT'],
        label: 'expense:loan_repayment',
        amountRange: [-20000, -1000] as [number, number],
      },
      {
        templates: ['REFUND FROM {company}', 'CREDIT NOTE {company}', 'VENDOR REFUND'],
        label: 'refund:vendor',
        amountRange: [20, 5000] as [number, number],
      },
      {
        templates: ['MISC DEBIT', 'UNKNOWN CHARGE', 'REVERSAL ADJUSTMENT', 'CASH DEPOSIT'],
        label: 'unknown',
        amountRange: [-1000, 1000] as [number, number],
      },
    ];

    const companies = [
      'TechCorp',
      'Global Solutions',
      'Alpha Industries',
      'Beta Corp',
      'Supplier Alpha',
      'Retail Plus',
      'Staples',
      'Cairo Properties',
    ];
    const months = [
      'JAN',
      'FEB',
      'MAR',
      'APR',
      'MAY',
      'JUN',
      'JUL',
      'AUG',
      'SEP',
      'OCT',
      'NOV',
      'DEC',
    ];
    const refs = ['INV-001', 'INV-002', 'BILL-001', 'REF-1234', 'CHQ-5678'];

    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const pattern = this.pick(patterns);
      let desc = this.pick(pattern.templates)
        .replace('{company}', this.pick(companies))
        .replace('{month}', this.pick(months))
        .replace('{ref}', this.pick(refs));
      desc += ` ${this.randInt(10000, 99999)}`;

      records.push({
        inputData: {
          description: desc,
          amount: this.randFloat(pattern.amountRange[0], pattern.amountRange[1]),
          date: `2025-${String(this.randInt(1, 12)).padStart(2, '0')}-${String(this.randInt(1, 28)).padStart(2, '0')}`,
        },
        label: pattern.label,
      });
    }
    return records;
  }

  private genOcrLayout(count: number): TrainingRecord[] {
    const vendors = [
      'Staples',
      'Egypt Telecom',
      'Cairo Properties',
      'Nile Insurance',
      'Baker McKenzie',
      'Digital Marketing Pro',
      'EgyptAir',
      'Supplier Alpha',
    ];
    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const vendor = this.pick(vendors);
      records.push({
        inputData: {
          vendorName: vendor,
          fieldPositions: {
            invoiceNumber: {
              x: this.randInt(50, 400),
              y: this.randInt(50, 150),
              w: this.randInt(100, 200),
              h: this.randInt(20, 40),
            },
            date: {
              x: this.randInt(300, 500),
              y: this.randInt(50, 150),
              w: this.randInt(80, 150),
              h: this.randInt(20, 40),
            },
            total: {
              x: this.randInt(300, 500),
              y: this.randInt(500, 700),
              w: this.randInt(80, 150),
              h: this.randInt(20, 40),
            },
            vendorName: {
              x: this.randInt(50, 200),
              y: this.randInt(20, 80),
              w: this.randInt(150, 300),
              h: this.randInt(20, 50),
            },
          },
        },
        label: JSON.stringify({ vendor, format: this.pick(['standard', 'compact', 'detailed']) }),
      });
    }
    return records;
  }

  private genDemandForecast(count: number): TrainingRecord[] {
    const items = [
      'Laptop Pro 15',
      'Wireless Mouse',
      'USB-C Hub',
      'Monitor 27"',
      'Keyboard Mechanical',
      'Webcam HD',
      'Headset Wireless',
      'Docking Station',
    ];
    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const month = this.randInt(1, 12);
      const baseDemand = this.randInt(10, 200);
      const seasonal = month === 12 || month === 11 ? 2.0 : month === 9 ? 1.5 : 1.0;
      const predicted = Math.round(baseDemand * seasonal * (0.8 + Math.random() * 0.4));
      records.push({
        inputData: {
          itemName: this.pick(items),
          month,
          year: this.pick([2024, 2025]),
          historicalSales: Array.from({ length: 6 }, () =>
            Math.round(baseDemand * (0.7 + Math.random() * 0.6)),
          ),
          avgDailyDemand: this.randFloat(0.5, 10),
        },
        label: String(predicted),
      });
    }
    return records;
  }

  private genLeadScoring(count: number): TrainingRecord[] {
    const sources = ['WEBSITE', 'FACEBOOK_ADS', 'GOOGLE_ADS', 'REFERRAL', 'COLD_CALL', 'OTHER'];
    const industries = [
      'Technology',
      'Finance',
      'Healthcare',
      'Retail',
      'Manufacturing',
      'Education',
      'Real Estate',
    ];
    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const isWon = Math.random() > 0.5;
      records.push({
        inputData: {
          source: this.pick(sources),
          hasEmail: isWon ? Math.random() > 0.1 : Math.random() > 0.5,
          hasPhone: isWon ? Math.random() > 0.2 : Math.random() > 0.6,
          companySize: isWon
            ? this.pick(['MEDIUM', 'LARGE', 'ENTERPRISE'])
            : this.pick(['SOLO', 'SMALL', 'MEDIUM']),
          industry: this.pick(industries),
          daysSinceContact: isWon ? this.randInt(1, 30) : this.randInt(15, 120),
          pageViews: isWon ? this.randInt(5, 50) : this.randInt(0, 10),
          emailOpens: isWon ? this.randInt(3, 20) : this.randInt(0, 5),
          meetingsScheduled: isWon ? this.randInt(1, 5) : this.randInt(0, 1),
          estimatedDealValue: isWon ? this.randFloat(5000, 100000) : this.randFloat(100, 10000),
        },
        label: isWon ? 'WON' : 'LOST',
      });
    }
    return records;
  }

  private genAnomaly(count: number): TrainingRecord[] {
    const categories = [
      'Office Supplies',
      'Utilities',
      'Travel',
      'Marketing',
      'Insurance',
      'Rent',
      'Professional Fees',
      'Salary',
    ];
    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const isAnomaly = Math.random() > 0.8; // 20% anomalies
      const baseAmount = this.randFloat(100, 5000);
      records.push({
        inputData: {
          amount: isAnomaly ? baseAmount * this.randFloat(2.5, 5) : baseAmount,
          accountCode: this.pick(['6000', '6100', '6200', '6300', '6400', '6500', '6600', '6700']),
          category: this.pick(categories),
          dayOfWeek: this.randInt(0, 6),
          hourOfDay: this.randInt(0, 23),
          description: `Transaction ${this.pick(categories).toLowerCase()} payment`,
          historicalAvg: baseAmount,
          historicalStdDev: baseAmount * 0.2,
        },
        label: isAnomaly ? 'ANOMALY' : 'NORMAL',
      });
    }
    return records;
  }

  private genReorder(count: number): TrainingRecord[] {
    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const currentStock = this.randInt(0, 500);
      const avgDailyDemand = this.randFloat(0.5, 20);
      const leadTime = this.randInt(3, 30);
      const reorderPoint = Math.ceil(avgDailyDemand * leadTime * 1.5);
      const needsReorder = currentStock <= reorderPoint;
      records.push({
        inputData: {
          currentStock,
          avgDailyDemand,
          leadTimeDays: leadTime,
          demandStdDev: avgDailyDemand * 0.3,
          safetyStock: Math.ceil(avgDailyDemand * leadTime * 0.5),
          daysSinceLastSale: this.randInt(0, 60),
          seasonalIndex: this.randFloat(0.5, 2.0),
        },
        label: needsReorder ? 'REORDER' : 'OK',
      });
    }
    return records;
  }

  private genPaymentPrediction(count: number): TrainingRecord[] {
    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const avgDays = this.randInt(10, 60);
      const isLate = avgDays > 30;
      records.push({
        inputData: {
          customerAvgDaysToPayment: avgDays,
          customerPaymentStdDev: this.randFloat(2, 20),
          invoiceAmount: this.randFloat(100, 50000),
          daysSinceDue: isLate ? this.randInt(1, 45) : this.randInt(-30, 0),
          customerPaymentCount: this.randInt(1, 50),
          customerOverduePercent: isLate ? this.randFloat(0.3, 0.9) : this.randFloat(0, 0.2),
          paymentMode: this.pick(['BANK_TRANSFER', 'CHEQUE', 'ONLINE', 'CASH']),
        },
        label: isLate ? 'LATE' : 'ON_TIME',
      });
    }
    return records;
  }

  private genCashFlow(count: number): TrainingRecord[] {
    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const month = this.randInt(1, 12);
      const inflow = this.randFloat(50000, 500000);
      const outflow = this.randFloat(30000, 400000);
      const balance = inflow - outflow;
      records.push({
        inputData: {
          month,
          year: this.pick([2024, 2025, 2026]),
          historicalInflow: Array.from({ length: 6 }, () => this.randFloat(40000, 600000)),
          historicalOutflow: Array.from({ length: 6 }, () => this.randFloat(25000, 450000)),
          outstandingReceivables: this.randFloat(10000, 200000),
          outstandingPayables: this.randFloat(5000, 150000),
          seasonalIndex: this.randFloat(0.7, 1.5),
        },
        label: balance > 0 ? 'POSITIVE' : 'NEGATIVE',
      });
    }
    return records;
  }

  private genPatternDetection(count: number): TrainingRecord[] {
    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const isRecurring = Math.random() > 0.4;
      records.push({
        inputData: {
          description: isRecurring
            ? this.pick([
                'Monthly rent payment',
                'Internet subscription',
                'Insurance premium',
                'Office supplies order',
                'SaaS subscription',
                'Cleaning service',
              ])
            : this.pick([
                'Emergency repair',
                'One-time purchase',
                'Refund received',
                'Special project cost',
                'Equipment purchase',
                'Moving expense',
              ]),
          amount: this.randFloat(50, 15000),
          frequency: isRecurring ? this.randInt(25, 35) : 0,
          occurrenceCount: isRecurring ? this.randInt(3, 24) : 1,
          amountVariance: isRecurring ? this.randFloat(0, 0.05) : this.randFloat(0.3, 1.0),
          dayOfMonth: isRecurring ? this.randInt(1, 5) : this.randInt(1, 28),
        },
        label: isRecurring ? 'RECURRING' : 'ONE_TIME',
      });
    }
    return records;
  }

  // ─── Sales & CRM (5) ────────────────────────────────────

  private genChurnPrediction(count: number): TrainingRecord[] {
    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const isChurn = Math.random() > 0.6;
      records.push({
        inputData: {
          avgDaysToPayment: isChurn ? this.randFloat(35, 90) : this.randFloat(10, 30),
          paymentCount: isChurn ? this.randInt(1, 5) : this.randInt(5, 50),
          lastPaymentDaysAgo: isChurn ? this.randInt(60, 365) : this.randInt(1, 45),
          overduePercent: isChurn ? this.randFloat(0.4, 1.0) : this.randFloat(0, 0.2),
          totalSpend: isChurn ? this.randFloat(500, 10000) : this.randFloat(10000, 500000),
          orderFrequencyDays: isChurn ? this.randFloat(60, 180) : this.randFloat(7, 45),
          supportTickets: isChurn ? this.randInt(3, 20) : this.randInt(0, 3),
          lastInteractionDays: isChurn ? this.randInt(30, 180) : this.randInt(0, 14),
        },
        label: isChurn ? 'CHURN' : 'RETAIN',
      });
    }
    return records;
  }

  private genClvAnalysis(count: number): TrainingRecord[] {
    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const segment = this.pick(['HIGH', 'MEDIUM', 'LOW']);
      const multiplier = segment === 'HIGH' ? 3 : segment === 'MEDIUM' ? 1.5 : 0.5;
      records.push({
        inputData: {
          totalSpend: this.randFloat(1000, 100000) * multiplier,
          purchaseFrequency: this.randFloat(0.1, 10) * multiplier,
          avgOrderValue: this.randFloat(100, 5000) * multiplier,
          recencyDays:
            segment === 'HIGH'
              ? this.randInt(1, 30)
              : segment === 'MEDIUM'
                ? this.randInt(15, 90)
                : this.randInt(60, 365),
          tenureMonths: this.randInt(1, 60),
          returnRate: segment === 'LOW' ? this.randFloat(0.1, 0.4) : this.randFloat(0, 0.1),
          referralCount: segment === 'HIGH' ? this.randInt(1, 10) : 0,
        },
        label: segment,
      });
    }
    return records;
  }

  private genCrossSell(count: number): TrainingRecord[] {
    const products = [
      'ERP Basic',
      'ERP Pro',
      'Inventory Module',
      'HR Module',
      'CRM Module',
      'Analytics Dashboard',
      'API Access',
      'Custom Reports',
    ];
    const industries = [
      'Technology',
      'Finance',
      'Healthcare',
      'Retail',
      'Manufacturing',
      'Education',
    ];
    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const currentProducts = [this.pick(products)];
      if (Math.random() > 0.5)
        currentProducts.push(this.pick(products.filter((p) => !currentProducts.includes(p))));
      const recommendation = this.pick(products.filter((p) => !currentProducts.includes(p)));
      records.push({
        inputData: {
          currentProducts,
          industry: this.pick(industries),
          companySize: this.pick(['SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE']),
          monthsAsCustomer: this.randInt(1, 48),
          avgMonthlyUsage: this.randFloat(10, 500),
        },
        label: recommendation,
      });
    }
    return records;
  }

  private genDynamicPricing(count: number): TrainingRecord[] {
    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const demand = this.randFloat(0, 1);
      const competition = this.randFloat(0.5, 2);
      const optimal = demand > 0.7 ? 'INCREASE' : demand < 0.3 ? 'DECREASE' : 'MAINTAIN';
      records.push({
        inputData: {
          currentPrice: this.randFloat(10, 1000),
          demandIndex: demand,
          competitionPriceRatio: competition,
          seasonalityIndex: this.randFloat(0.5, 2),
          stockLevel: this.randInt(0, 500),
          costBase: this.randFloat(5, 500),
          daysSinceLastChange: this.randInt(0, 90),
        },
        label: optimal,
      });
    }
    return records;
  }

  private genPipelineForecast(count: number): TrainingRecord[] {
    const stages = ['PROSPECTING', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'CLOSING'];
    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const stage = this.pick(stages);
      const stageIdx = stages.indexOf(stage);
      const isWin = Math.random() < (stageIdx + 1) * 0.15 + 0.1;
      records.push({
        inputData: {
          stage,
          dealSize: this.randFloat(1000, 500000),
          daysSinceLastActivity: isWin ? this.randInt(0, 14) : this.randInt(7, 60),
          assigneeWinRate: isWin ? this.randFloat(0.3, 0.8) : this.randFloat(0.05, 0.3),
          dayInStage: isWin ? this.randInt(1, 14) : this.randInt(7, 60),
          totalInteractions: isWin ? this.randInt(5, 30) : this.randInt(0, 8),
          competitorMentioned: isWin ? Math.random() > 0.7 : Math.random() > 0.3,
        },
        label: isWin ? 'WIN' : 'LOSE',
      });
    }
    return records;
  }

  // ─── Security & Compliance (3) ──────────────────────────

  private genFraudDetection(count: number): TrainingRecord[] {
    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const isFraud = Math.random() > 0.85;
      records.push({
        inputData: {
          amount: isFraud ? this.randFloat(5000, 100000) : this.randFloat(10, 10000),
          frequency: isFraud ? this.randInt(10, 50) : this.randInt(0, 5),
          timeOfDay: isFraud ? this.randInt(22, 6) % 24 : this.randInt(8, 18),
          isRoundNumber: isFraud ? Math.random() > 0.3 : Math.random() > 0.8,
          daysSinceLastTxn: isFraud ? this.randFloat(0, 0.5) : this.randFloat(1, 30),
          entityType: this.pick(['expense', 'payment', 'transfer', 'journal']),
          amountToAvgRatio: isFraud ? this.randFloat(3, 10) : this.randFloat(0.5, 2),
          duplicateCount: isFraud ? this.randInt(1, 5) : 0,
          isNewVendor: isFraud ? Math.random() > 0.4 : Math.random() > 0.85,
        },
        label: isFraud ? 'SUSPICIOUS' : 'LEGIT',
      });
    }
    return records;
  }

  private genComplianceMonitoring(count: number): TrainingRecord[] {
    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const isNonCompliant = Math.random() > 0.75;
      records.push({
        inputData: {
          entityType: this.pick(['invoice', 'bill', 'expense', 'journal', 'payment']),
          ageDays: isNonCompliant ? this.randInt(30, 365) : this.randInt(0, 30),
          amount: this.randFloat(100, 100000),
          hasApproval: isNonCompliant ? Math.random() > 0.7 : Math.random() > 0.1,
          hasAttachment: isNonCompliant ? Math.random() > 0.8 : Math.random() > 0.2,
          approvalChainComplete: isNonCompliant ? false : Math.random() > 0.1,
          taxCalculated: isNonCompliant ? Math.random() > 0.6 : true,
          journalBalanced: isNonCompliant ? Math.random() > 0.5 : true,
        },
        label: isNonCompliant ? 'NON_COMPLIANT' : 'COMPLIANT',
      });
    }
    return records;
  }

  private genAuditRisk(count: number): TrainingRecord[] {
    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const isHighRisk = Math.random() > 0.7;
      records.push({
        inputData: {
          amount: isHighRisk ? this.randFloat(10000, 500000) : this.randFloat(10, 10000),
          approvalChainLength: isHighRisk ? this.randInt(0, 1) : this.randInt(2, 5),
          entityType: this.pick(['journal', 'expense', 'payment', 'invoice', 'bill']),
          frequency: isHighRisk ? this.randFloat(0, 0.5) : this.randFloat(1, 30),
          isManualEntry: isHighRisk ? Math.random() > 0.3 : Math.random() > 0.8,
          hasDocumentation: isHighRisk ? Math.random() > 0.6 : Math.random() > 0.1,
          isEndOfPeriod: isHighRisk ? Math.random() > 0.4 : Math.random() > 0.85,
          accountType: this.pick(['EXPENSE', 'REVENUE', 'ASSET', 'LIABILITY']),
        },
        label: isHighRisk ? 'HIGH_RISK' : 'LOW_RISK',
      });
    }
    return records;
  }

  // ─── NLP & Documents (4) ────────────────────────────────

  private genDocumentClassification(count: number): TrainingRecord[] {
    const billTexts = [
      'Bill from',
      'Payment due',
      'Vendor invoice',
      'Purchase order',
      'Amount owed',
      'Payable to',
      'Supplier statement',
    ];
    const invoiceTexts = [
      'Invoice #',
      'Bill to:',
      'Customer invoice',
      'Sales invoice',
      'Amount due from customer',
      'Payment terms Net',
      'Tax invoice',
    ];
    const receiptTexts = [
      'Receipt #',
      'Thank you for your purchase',
      'Payment received',
      'Cash receipt',
      'Transaction confirmed',
      'Paid in full',
    ];
    const otherTexts = [
      'Contract agreement',
      'Meeting notes',
      'Policy document',
      'Report summary',
      'Memo regarding',
      'Notice of',
    ];

    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const type = this.pick(['BILL', 'INVOICE', 'RECEIPT', 'OTHER']);
      const templates =
        type === 'BILL'
          ? billTexts
          : type === 'INVOICE'
            ? invoiceTexts
            : type === 'RECEIPT'
              ? receiptTexts
              : otherTexts;
      records.push({
        inputData: {
          text: `${this.pick(templates)} ${this.randInt(1000, 9999)} - ${this.pick(['consulting services', 'product delivery', 'monthly subscription', 'professional services', 'equipment rental'])}. Total: $${this.randFloat(100, 50000)}`,
          fileType: this.pick(['pdf', 'jpg', 'png']),
          pageCount: this.randInt(1, 5),
        },
        label: type,
      });
    }
    return records;
  }

  private genSentimentAnalysis(count: number): TrainingRecord[] {
    const positive = [
      'Great service, very happy',
      'Excellent product quality',
      'Fast delivery, impressed',
      'Outstanding support team',
      'Love the new features',
      'Highly recommended',
      'Best experience ever',
      'Wonderful customer care',
      'Perfect solution for us',
      'Amazing value for money',
    ];
    const negative = [
      'Terrible experience',
      'Very disappointed with quality',
      'Late delivery again',
      'Poor customer support',
      'Product broke after a week',
      'Would not recommend',
      'Worst service ever',
      'Complete waste of money',
      'Unacceptable delays',
      'Missing items in order',
    ];
    const neutral = [
      'Order received as expected',
      'Standard delivery time',
      'Product meets specifications',
      'Acceptable quality',
      'Regular monthly order',
      'No issues to report',
      'Everything as described',
      'Normal transaction',
      'Routine purchase',
      'Standard service',
    ];

    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const sentiment = this.pick(['POSITIVE', 'NEGATIVE', 'NEUTRAL']);
      const texts =
        sentiment === 'POSITIVE' ? positive : sentiment === 'NEGATIVE' ? negative : neutral;
      records.push({
        inputData: {
          text: `${this.pick(texts)} - order #${this.randInt(1000, 9999)}`,
        },
        label: sentiment,
      });
    }
    return records;
  }

  private genEntityExtraction(count: number): TrainingRecord[] {
    const names = ['John Smith', 'Ahmed Hassan', 'Sarah Johnson', 'Mohamed Ali', 'Lisa Chen'];
    const companies = [
      'TechCorp Egypt',
      'Global Solutions',
      'Alpha Industries',
      'Nile Trading Co',
      'Delta Systems',
    ];
    const cities = ['Cairo', 'Alexandria', 'New York', 'London', 'Dubai'];

    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const name = this.pick(names);
      const company = this.pick(companies);
      const city = this.pick(cities);
      const amount = this.randFloat(100, 50000);
      const date = `${this.pick(['January', 'February', 'March', 'April', 'May'])} ${this.randInt(1, 28)}, ${this.pick([2024, 2025, 2026])}`;

      records.push({
        inputData: {
          text: `${this.pick(['Invoice', 'Bill', 'Contract', 'Agreement'])} from ${company} addressed to ${name} in ${city}. Amount: $${amount.toFixed(2)}. Date: ${date}. Reference: REF-${this.randInt(1000, 9999)}.`,
        },
        label: JSON.stringify({
          persons: [name],
          organizations: [company],
          locations: [city],
          amounts: [amount],
          dates: [date],
        }),
      });
    }
    return records;
  }

  private genContractAnalysis(count: number): TrainingRecord[] {
    const favorable = [
      'Payment within 30 days standard terms',
      'Automatic renewal with 30-day notice',
      'Mutual termination clause',
      'Standard liability cap at contract value',
      'Annual price adjustment by CPI',
    ];
    const risky = [
      'Payment upon completion with no milestone',
      'Auto-renewal without notice period',
      'Unilateral termination by vendor only',
      'Unlimited liability clause',
      'Price increases at vendor discretion',
      'Exclusive dealing requirement',
    ];
    const neutralClauses = [
      'Governing law of Egypt applies',
      'Dispute resolution via arbitration',
      'Confidentiality for 2 years post-termination',
      'Force majeure standard clause',
      'Assignment requires written consent',
    ];

    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const type = this.pick(['FAVORABLE', 'RISKY', 'NEUTRAL']);
      const clauses = type === 'FAVORABLE' ? favorable : type === 'RISKY' ? risky : neutralClauses;
      records.push({
        inputData: {
          text: this.pick(clauses),
          clauseType: this.pick([
            'payment',
            'termination',
            'liability',
            'renewal',
            'pricing',
            'exclusivity',
            'confidentiality',
          ]),
          contractValue: this.randFloat(5000, 500000),
        },
        label: type,
      });
    }
    return records;
  }

  // ─── HR & Workforce (3) ─────────────────────────────────

  private genEmployeeAttrition(count: number): TrainingRecord[] {
    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const isLeave = Math.random() > 0.65;
      records.push({
        inputData: {
          tenureMonths: isLeave ? this.randInt(6, 24) : this.randInt(12, 120),
          absenceRate: isLeave ? this.randFloat(0.08, 0.25) : this.randFloat(0.01, 0.06),
          performanceScore: isLeave ? this.randFloat(1, 3) : this.randFloat(3, 5),
          salaryToMarketRatio: isLeave ? this.randFloat(0.7, 0.95) : this.randFloat(0.95, 1.3),
          lastPromotionMonths: isLeave ? this.randInt(18, 60) : this.randInt(0, 18),
          overtimeHoursMonth: isLeave ? this.randFloat(20, 60) : this.randFloat(0, 15),
          trainingHoursYear: isLeave ? this.randInt(0, 10) : this.randInt(10, 50),
          department: this.pick([
            'Engineering',
            'Sales',
            'Marketing',
            'Operations',
            'Finance',
            'HR',
            'Support',
          ]),
        },
        label: isLeave ? 'LEAVE' : 'STAY',
      });
    }
    return records;
  }

  private genCompensationBenchmark(count: number): TrainingRecord[] {
    const roles = [
      'Software Engineer',
      'Sales Manager',
      'Accountant',
      'HR Specialist',
      'Project Manager',
      'Data Analyst',
      'Marketing Lead',
      'Operations Manager',
    ];
    const locations = ['Cairo', 'Alexandria', 'Dubai', 'Riyadh', 'London'];
    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const experience = this.randInt(0, 20);
      const base = 3000 + experience * 500;
      const range = this.pick(['BELOW_MARKET', 'AT_MARKET', 'ABOVE_MARKET']);
      records.push({
        inputData: {
          role: this.pick(roles),
          experienceYears: experience,
          location: this.pick(locations),
          skills: Array.from({ length: this.randInt(2, 6) }, () =>
            this.pick([
              'JavaScript',
              'Python',
              'SQL',
              'Excel',
              'Leadership',
              'Communication',
              'AWS',
              'Finance',
            ]),
          ),
          currentSalary:
            range === 'BELOW_MARKET' ? base * 0.75 : range === 'ABOVE_MARKET' ? base * 1.25 : base,
          companySize: this.pick(['SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE']),
        },
        label: range,
      });
    }
    return records;
  }

  private genSkillsGap(count: number): TrainingRecord[] {
    const allSkills = [
      'JavaScript',
      'Python',
      'SQL',
      'React',
      'Node.js',
      'AWS',
      'Docker',
      'Leadership',
      'Communication',
      'Excel',
      'Finance',
      'Project Management',
      'Data Analysis',
      'Machine Learning',
      'DevOps',
    ];
    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const currentSkills = Array.from({ length: this.randInt(2, 6) }, () => this.pick(allSkills));
      const requiredSkills = Array.from({ length: this.randInt(3, 8) }, () => this.pick(allSkills));
      const gapCount = requiredSkills.filter((s) => !currentSkills.includes(s)).length;
      const assessment =
        gapCount >= 4 ? 'CRITICAL_GAP' : gapCount >= 2 ? 'MODERATE_GAP' : 'MINIMAL_GAP';
      records.push({
        inputData: {
          currentSkills,
          requiredSkills,
          roleCategory: this.pick(['Engineering', 'Management', 'Sales', 'Finance', 'Operations']),
          experienceYears: this.randInt(0, 15),
          trainingBudget: this.randFloat(500, 10000),
        },
        label: assessment,
      });
    }
    return records;
  }

  // ─── Operations (5) ─────────────────────────────────────

  private genQualityPrediction(count: number): TrainingRecord[] {
    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const isFail = Math.random() > 0.8;
      records.push({
        inputData: {
          machineId: `MACH-${this.randInt(1, 10)}`,
          temperature: isFail ? this.randFloat(80, 120) : this.randFloat(40, 75),
          cycleTime: isFail ? this.randFloat(1.5, 3) : this.randFloat(0.8, 1.3),
          materialBatch: `BATCH-${this.randInt(100, 999)}`,
          operatorExperience: isFail ? this.randInt(0, 6) : this.randInt(6, 240),
          humidityPercent: this.randFloat(30, 80),
          vibrationLevel: isFail ? this.randFloat(5, 10) : this.randFloat(0, 4),
        },
        label: isFail ? 'FAIL' : 'PASS',
      });
    }
    return records;
  }

  private genPredictiveMaintenance(count: number): TrainingRecord[] {
    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const needsService = Math.random() > 0.7;
      records.push({
        inputData: {
          machineId: `MACH-${this.randInt(1, 20)}`,
          ageMonths: needsService ? this.randInt(24, 120) : this.randInt(0, 36),
          lastServiceDays: needsService ? this.randInt(90, 365) : this.randInt(0, 60),
          errorCount30Days: needsService ? this.randInt(3, 20) : this.randInt(0, 2),
          avgTemperature: needsService ? this.randFloat(75, 110) : this.randFloat(40, 70),
          vibrationTrend: needsService ? 'INCREASING' : this.pick(['STABLE', 'DECREASING']),
          operatingHours: this.randInt(100, 10000),
        },
        label: needsService ? 'NEEDS_SERVICE' : 'OK',
      });
    }
    return records;
  }

  private genWorkforceScheduling(count: number): TrainingRecord[] {
    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const demand = this.randFloat(0.3, 1.5);
      const level = demand > 1.0 ? 'HIGH' : demand > 0.6 ? 'NORMAL' : 'LOW';
      records.push({
        inputData: {
          dayOfWeek: this.randInt(0, 6),
          month: this.randInt(1, 12),
          isHoliday: Math.random() > 0.9,
          historicalDemand: Array.from({ length: 4 }, () => this.randFloat(0.3, 1.5)),
          seasonalityIndex: this.randFloat(0.5, 2),
          specialEvents: Math.random() > 0.85,
          weatherForecast: this.pick(['SUNNY', 'RAINY', 'COLD', 'HOT']),
        },
        label: level,
      });
    }
    return records;
  }

  private genRouteOptimization(count: number): TrainingRecord[] {
    const cities = [
      'Cairo',
      'Alexandria',
      'Giza',
      'Luxor',
      'Aswan',
      'Hurghada',
      'Sharm El Sheikh',
      'Mansoura',
      'Port Said',
      'Suez',
    ];
    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const origin = this.pick(cities);
      const destination = this.pick(cities.filter((c) => c !== origin));
      const urgency = this.pick(['LOW', 'MEDIUM', 'HIGH', 'EXPRESS']);
      const optimalRoute =
        urgency === 'EXPRESS'
          ? 'AIR'
          : urgency === 'HIGH'
            ? 'HIGHWAY'
            : this.pick(['HIGHWAY', 'STANDARD', 'ECONOMIC']);
      records.push({
        inputData: {
          origin,
          destination,
          weight: this.randFloat(0.5, 1000),
          volume: this.randFloat(0.1, 50),
          urgency,
          isFragile: Math.random() > 0.8,
          timeWindow: this.pick(['MORNING', 'AFTERNOON', 'EVENING', 'ANY']),
        },
        label: optimalRoute,
      });
    }
    return records;
  }

  private genResourceOptimization(count: number): TrainingRecord[] {
    const resources = ['WAREHOUSE_SPACE', 'DELIVERY_VEHICLES', 'STAFF', 'MACHINES', 'BUDGET'];
    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const utilization = this.randFloat(0.1, 1.0);
      const allocation = utilization > 0.8 ? 'EXPAND' : utilization < 0.4 ? 'REDUCE' : 'MAINTAIN';
      records.push({
        inputData: {
          resourceType: this.pick(resources),
          currentUtilization: utilization,
          demandForecast: this.randFloat(0.5, 2.0),
          costPerUnit: this.randFloat(10, 1000),
          availableCapacity: this.randInt(1, 100),
          peakDemandRatio: this.randFloat(1.0, 3.0),
        },
        label: allocation,
      });
    }
    return records;
  }

  // ─── Chat & Voice (3) ───────────────────────────────────

  private genChatbot(count: number): TrainingRecord[] {
    const intents: Array<{ intent: string; messages: string[] }> = [
      {
        intent: 'expenses',
        messages: [
          'What are my top expenses?',
          'Show expense breakdown',
          'How much did I spend this month?',
          'Expense summary please',
          'List biggest expenses',
        ],
      },
      {
        intent: 'revenue',
        messages: [
          'What is my revenue?',
          'Show sales numbers',
          'How much did we earn?',
          'Revenue this quarter',
          'Total income report',
        ],
      },
      {
        intent: 'forecast',
        messages: [
          'Predict cash flow',
          'What is the forecast?',
          'Predict next month revenue',
          'Cash flow prediction',
          'Financial forecast',
        ],
      },
      {
        intent: 'invoices',
        messages: [
          'Show overdue invoices',
          'List unpaid invoices',
          'Invoice status',
          'Who owes us money?',
          'Accounts receivable summary',
        ],
      },
      {
        intent: 'bills',
        messages: [
          'Show pending bills',
          'What bills are due?',
          'Upcoming payments',
          'Accounts payable summary',
          'Bills to pay this week',
        ],
      },
      {
        intent: 'inventory',
        messages: [
          'Low stock items',
          'Inventory status',
          'What needs reordering?',
          'Stock levels report',
          'Warehouse summary',
        ],
      },
      {
        intent: 'employees',
        messages: [
          'Employee count',
          'Staff on leave today',
          'Attendance report',
          'Team performance',
          'Payroll summary',
        ],
      },
      {
        intent: 'help',
        messages: [
          'How do I create an invoice?',
          'Help with reconciliation',
          'How to add a vendor?',
          'Guide me through billing',
          'How does this work?',
        ],
      },
      { intent: 'greeting', messages: ['Hello', 'Hi there', 'Good morning', 'Hey', 'Greetings'] },
      {
        intent: 'anomalies',
        messages: [
          'Any unusual transactions?',
          'Show anomalies',
          'Suspicious activity?',
          'Detect fraud',
          'Alert me of irregularities',
        ],
      },
    ];

    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const intentGroup = this.pick(intents);
      records.push({
        inputData: {
          message:
            this.pick(intentGroup.messages) +
            (Math.random() > 0.5 ? ` ${this.randInt(1, 12)}/2025` : ''),
        },
        label: intentGroup.intent,
      });
    }
    return records;
  }

  private genKnowledgeAssistant(count: number): TrainingRecord[] {
    const categories: Array<{ category: string; questions: string[] }> = [
      {
        category: 'accounting',
        questions: [
          'What is double-entry bookkeeping?',
          'How do journal entries work?',
          'Explain accounts receivable',
          'What is a trial balance?',
          'How to close the books?',
        ],
      },
      {
        category: 'tax',
        questions: [
          'VAT filing deadline?',
          'How to calculate withholding tax?',
          'Tax deductible expenses?',
          'Corporate tax rate in Egypt?',
          'How to file VAT return?',
        ],
      },
      {
        category: 'inventory',
        questions: [
          'What is FIFO method?',
          'How to do stock take?',
          'Economic order quantity explained',
          'Safety stock calculation?',
          'ABC analysis method?',
        ],
      },
      {
        category: 'hr',
        questions: [
          'Leave policy rules?',
          'How to calculate overtime?',
          'Employee benefits guide?',
          'Payroll processing steps?',
          'Performance review process?',
        ],
      },
      {
        category: 'system',
        questions: [
          'How to export reports?',
          'Multi-currency setup?',
          'User permissions guide?',
          'Data backup process?',
          'Integration options?',
        ],
      },
    ];

    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const cat = this.pick(categories);
      records.push({
        inputData: { question: this.pick(cat.questions), category: cat.category },
        label: cat.category,
      });
    }
    return records;
  }

  private genVoiceCommand(count: number): TrainingRecord[] {
    const commands: Array<{ intent: string; transcriptions: string[] }> = [
      {
        intent: 'create_invoice',
        transcriptions: [
          'Create a new invoice',
          'Make an invoice for customer',
          'New invoice please',
          'Invoice creation',
          'Bill the customer',
        ],
      },
      {
        intent: 'show_dashboard',
        transcriptions: [
          'Show me the dashboard',
          'Go to dashboard',
          'Open main screen',
          'Display overview',
          'Home page',
        ],
      },
      {
        intent: 'run_report',
        transcriptions: [
          'Run the P&L report',
          'Generate balance sheet',
          'Show me the report',
          'Financial statements',
          'Profit and loss',
        ],
      },
      {
        intent: 'search',
        transcriptions: [
          'Search for invoice 1234',
          'Find customer TechCorp',
          'Look up bill number',
          'Search transactions',
          'Find expense',
        ],
      },
      {
        intent: 'navigate',
        transcriptions: [
          'Go to invoices page',
          'Open settings',
          'Navigate to inventory',
          'Show me bills',
          'Open customers list',
        ],
      },
    ];

    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      const cmd = this.pick(commands);
      records.push({
        inputData: { transcription: this.pick(cmd.transcriptions) },
        label: cmd.intent,
      });
    }
    return records;
  }

  // ─── Fallback ───────────────────────────────────────────

  private genGeneric(feature: AiFeature, count: number): TrainingRecord[] {
    const records: TrainingRecord[] = [];
    for (let i = 0; i < count; i++) {
      records.push({
        inputData: {
          feature: feature.toString(),
          value: this.randFloat(0, 100),
          category: this.pick(['A', 'B', 'C', 'D']),
          timestamp: new Date(Date.now() - this.randInt(0, 365) * 86400000).toISOString(),
        },
        label: this.pick(['CLASS_A', 'CLASS_B', 'CLASS_C']),
      });
    }
    return records;
  }
}
