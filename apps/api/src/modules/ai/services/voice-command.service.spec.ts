import { Test, TestingModule } from '@nestjs/testing';
import { VoiceCommandService, ParsedCommand } from './voice-command.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import {
  createMockPrisma,
  MockPrismaClient,
  TEST_ORG_ID,
  mockDecimal,
} from '../__tests__/fixtures/ai-test-helpers';

describe('VoiceCommandService', () => {
  let service: VoiceCommandService;
  let prisma: MockPrismaClient;

  const orgId = TEST_ORG_ID;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoiceCommandService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: OllamaInferenceGateway,
          useValue: {
            generateCompletion: jest.fn().mockResolvedValue(''),
            generateStructuredOutput: jest.fn().mockResolvedValue({}),
            isAvailable: jest.fn().mockResolvedValue(false),
          },
        },
      ],
    }).compile();

    service = module.get<VoiceCommandService>(VoiceCommandService);
  });

  // ---------------------------------------------------------------------------
  // parseCommand
  // ---------------------------------------------------------------------------
  describe('parseCommand', () => {
    it('should detect CREATE action and INVOICE entity for "create invoice for Acme"', () => {
      const result = service.parseCommand('create invoice for Acme');

      expect(result.action).toBe('CREATE');
      expect(result.entityType).toBe('invoice');
      expect(result.originalText).toBe('create invoice for Acme');
    });

    it('should detect READ action and CUSTOMER entity for "show all customers"', () => {
      const result = service.parseCommand('show all customers');

      expect(result.action).toBe('READ');
      expect(result.entityType).toBe('customer');
    });

    it('should detect READ action and INVOICE entity for "list invoices"', () => {
      const result = service.parseCommand('list invoices');

      expect(result.action).toBe('READ');
      expect(result.entityType).toBe('invoice');
    });

    it('should detect DELETE action for "delete invoice"', () => {
      const result = service.parseCommand('delete invoice');

      expect(result.action).toBe('DELETE');
      expect(result.entityType).toBe('invoice');
    });

    it('should detect UPDATE action for "update customer"', () => {
      const result = service.parseCommand('update customer');

      expect(result.action).toBe('UPDATE');
      expect(result.entityType).toBe('customer');
    });

    it('should extract invoice number parameter from "show invoice INV-001"', () => {
      const result = service.parseCommand('show invoice INV-001');

      expect(result.parameters.invoiceNumber).toBe('INV-001');
    });

    it('should detect vendor entity for "list vendors"', () => {
      const result = service.parseCommand('list all vendors');

      expect(result.entityType).toBe('vendor');
    });

    it('should detect payment entity for "show recent payments"', () => {
      const result = service.parseCommand('show recent payments');

      expect(result.entityType).toBe('payment');
      expect(result.parameters.filter).toBe('recent');
    });

    it('should detect report entity for "generate P&L report"', () => {
      const result = service.parseCommand('generate P&L report');

      expect(result.entityType).toBe('report');
      expect(result.parameters.reportType).toBe('pl');
    });

    it('should detect overdue filter for "show overdue invoices"', () => {
      const result = service.parseCommand('show overdue invoices');

      expect(result.parameters.filter).toBe('overdue');
    });

    it('should detect draft filter for "show draft invoices"', () => {
      const result = service.parseCommand('show draft invoices');

      expect(result.parameters.filter).toBe('draft');
    });

    it('should detect paid filter for "show paid invoices"', () => {
      const result = service.parseCommand('show paid invoices');

      expect(result.parameters.filter).toBe('paid');
    });

    it('should return null entityType for unrecognized entity', () => {
      const result = service.parseCommand('do something with xyz');

      expect(result.entityType).toBeNull();
    });

    it('should default to READ action when no verb is recognized', () => {
      const result = service.parseCommand('invoices');

      expect(result.action).toBe('READ');
    });

    it('should return confidence between 0 and 1', () => {
      const result = service.parseCommand('create invoice for Acme');

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should have higher confidence when action + entity + params all detected', () => {
      const withAll = service.parseCommand('create invoice for Acme INV-001');
      const withNone = service.parseCommand('something something');

      expect(withAll.confidence).toBeGreaterThan(withNone.confidence);
    });

    it('should detect bill entity for "create bill"', () => {
      const result = service.parseCommand('create a new bill');

      expect(result.action).toBe('CREATE');
      expect(result.entityType).toBe('bill');
    });

    it('should detect account entity for "check account balance"', () => {
      const result = service.parseCommand('check account balance');

      expect(result.entityType).toBe('account');
    });

    it('should detect balance sheet report type', () => {
      const result = service.parseCommand('generate balance sheet report');

      expect(result.parameters.reportType).toBe('balance_sheet');
    });
  });

  // ---------------------------------------------------------------------------
  // executeCommand
  // ---------------------------------------------------------------------------
  describe('executeCommand', () => {
    it('should return error when entityType is null', async () => {
      const command: ParsedCommand = {
        action: 'READ',
        entityType: null,
        parameters: {},
        confidence: 0.5,
        originalText: 'do something',
      };

      const result = await service.executeCommand(orgId, command);

      expect(result.success).toBe(false);
      expect(result.message).toContain('could not determine');
    });

    it('should return invoice data for READ invoice command', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: 'inv-1',
        invoiceNumber: 'INV-001',
        status: 'SENT',
        grandTotal: mockDecimal(5000),
        dueDate: new Date('2025-07-01'),
        customer: { name: 'Acme Corp' },
      } as any);

      const command: ParsedCommand = {
        action: 'READ',
        entityType: 'invoice',
        parameters: { invoiceNumber: 'INV-001' },
        confidence: 0.85,
        originalText: 'show invoice INV-001',
      };

      const result = await service.executeCommand(orgId, command);

      expect(result.success).toBe(true);
      expect(result.data?.invoiceNumber).toBe('INV-001');
    });

    it('should return not-found for non-existent invoice', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null as any);

      const command: ParsedCommand = {
        action: 'READ',
        entityType: 'invoice',
        parameters: { invoiceNumber: 'INV-999' },
        confidence: 0.85,
        originalText: 'show invoice INV-999',
      };

      const result = await service.executeCommand(orgId, command);

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should return filtered invoices for overdue filter', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          invoiceNumber: 'INV-001',
          status: 'OVERDUE',
          grandTotal: mockDecimal(3000),
          dueDate: new Date('2025-05-01'),
          customer: { name: 'Late Payer Co' },
        },
      ] as any);

      const command: ParsedCommand = {
        action: 'READ',
        entityType: 'invoice',
        parameters: { filter: 'overdue' },
        confidence: 0.85,
        originalText: 'show overdue invoices',
      };

      const result = await service.executeCommand(orgId, command);

      expect(result.success).toBe(true);
      expect(result.data?.count).toBe(1);
    });

    it('should return customer data for READ customer command', async () => {
      prisma.customer.findMany.mockResolvedValue([
        { id: 'cust-1', name: 'Acme Corp', email: 'contact@acme.com', phone: '555-1234' },
      ] as any);

      const command: ParsedCommand = {
        action: 'READ',
        entityType: 'customer',
        parameters: { name: 'Acme' },
        confidence: 0.85,
        originalText: 'find customer Acme',
      };

      const result = await service.executeCommand(orgId, command);

      expect(result.success).toBe(true);
      expect((result.data as { customers: Array<{ name: string }> })?.customers[0].name).toBe(
        'Acme Corp',
      );
    });

    it('should return account balance for READ account command', async () => {
      prisma.account.findFirst.mockResolvedValue({
        id: 'acc-1',
        name: 'Cash',
        code: '1000',
        type: 'ASSET',
        openingBalance: mockDecimal(25000),
      } as any);

      const command: ParsedCommand = {
        action: 'READ',
        entityType: 'account',
        parameters: { accountName: 'Cash' },
        confidence: 0.85,
        originalText: 'balance of Cash',
      };

      const result = await service.executeCommand(orgId, command);

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('Cash');
      expect(result.data?.balance).toBe(25000);
    });

    it('should return confirmation prompt for CREATE invoice', async () => {
      const command: ParsedCommand = {
        action: 'CREATE',
        entityType: 'invoice',
        parameters: { customerName: 'Acme Corp' },
        confidence: 0.85,
        originalText: 'create invoice for Acme Corp',
      };

      const result = await service.executeCommand(orgId, command);

      expect(result.success).toBe(true);
      expect(result.requiresConfirmation).toBe(true);
      expect(result.data?.navigateTo).toBe('/sales/invoices/new');
    });

    it('should reject UPDATE commands as unsupported', async () => {
      const command: ParsedCommand = {
        action: 'UPDATE',
        entityType: 'invoice',
        parameters: {},
        confidence: 0.85,
        originalText: 'update invoice',
      };

      const result = await service.executeCommand(orgId, command);

      expect(result.success).toBe(false);
      expect(result.message).toContain('not supported');
    });

    it('should reject DELETE commands for safety', async () => {
      const command: ParsedCommand = {
        action: 'DELETE',
        entityType: 'invoice',
        parameters: {},
        confidence: 0.85,
        originalText: 'delete invoice',
      };

      const result = await service.executeCommand(orgId, command);

      expect(result.success).toBe(false);
      expect(result.message).toContain('not allowed');
    });

    it('should return vendor data for READ vendor command', async () => {
      prisma.vendor.findMany.mockResolvedValue([
        { id: 'ven-1', name: 'Office Supplies Inc', email: 'info@office.com' },
      ] as any);

      const command: ParsedCommand = {
        action: 'READ',
        entityType: 'vendor',
        parameters: {},
        confidence: 0.85,
        originalText: 'list all vendors',
      };

      const result = await service.executeCommand(orgId, command);

      expect(result.success).toBe(true);
      expect((result.data as { vendors: unknown[] })?.vendors.length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // getAvailableCommands
  // ---------------------------------------------------------------------------
  describe('getAvailableCommands', () => {
    it('should return a non-empty list of commands', () => {
      const result = service.getAvailableCommands();

      expect(result.commands.length).toBeGreaterThan(0);
    });

    it('should include CREATE, READ action types', () => {
      const result = service.getAvailableCommands();
      const actions = result.commands.map((c) => c.action);

      expect(actions).toContain('CREATE');
      expect(actions).toContain('READ');
    });

    it('should include invoice, customer, vendor, account entity types', () => {
      const result = service.getAvailableCommands();
      const entityTypes = result.commands.map((c) => c.entityType);

      expect(entityTypes).toContain('invoice');
      expect(entityTypes).toContain('customer');
      expect(entityTypes).toContain('vendor');
      expect(entityTypes).toContain('account');
    });

    it('should include example text for each command', () => {
      const result = service.getAvailableCommands();

      result.commands.forEach((cmd) => {
        expect(cmd.pattern.length).toBeGreaterThan(0);
        expect(cmd.example.length).toBeGreaterThan(0);
      });
    });
  });
});
