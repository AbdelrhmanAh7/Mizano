import { HttpException, HttpStatus } from '@nestjs/common';

export interface BusinessRuleErrorDetails {
  field?: string;
  constraint?: string;
  value?: unknown;
  expected?: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * Exception for business rule violations
 * Use for domain-specific errors like:
 * - Journal entry not balanced
 * - Insufficient inventory
 * - Invoice already paid
 * - Period is locked
 */
export class BusinessRuleException extends HttpException {
  public readonly code: string;
  public readonly details: BusinessRuleErrorDetails;

  constructor(
    code: string,
    message: string,
    details?: BusinessRuleErrorDetails,
    statusCode: HttpStatus = HttpStatus.UNPROCESSABLE_ENTITY,
  ) {
    super(
      {
        statusCode,
        code,
        message,
        error: 'Business Rule Violation',
        details,
      },
      statusCode,
    );
    this.code = code;
    this.details = details || {};
  }

  static journalNotBalanced(debits: number, credits: number) {
    return new BusinessRuleException(
      'JOURNAL_NOT_BALANCED',
      `Journal entry must balance. Debits: ${debits}, Credits: ${credits}`,
      {
        constraint: 'balance',
        value: { debits, credits },
        expected: 'debits === credits',
      },
    );
  }

  static insufficientInventory(itemId: string, required: number, available: number) {
    return new BusinessRuleException(
      'INSUFFICIENT_INVENTORY',
      `Insufficient inventory. Required: ${required}, Available: ${available}`,
      {
        field: 'quantity',
        value: available,
        expected: required,
        metadata: { itemId },
      },
    );
  }

  static periodLocked(date: string, lockDate: string) {
    return new BusinessRuleException(
      'PERIOD_LOCKED',
      `Cannot modify transactions before lock date ${lockDate}`,
      {
        field: 'date',
        value: date,
        expected: `> ${lockDate}`,
      },
    );
  }

  static documentAlreadyPosted(documentType: string, documentNumber: string) {
    return new BusinessRuleException(
      'DOCUMENT_ALREADY_POSTED',
      `${documentType} ${documentNumber} is already posted and cannot be modified`,
      {
        constraint: 'status',
        metadata: { documentType, documentNumber },
      },
    );
  }

  static invoiceAlreadyPaid(invoiceNumber: string, paidAmount: number) {
    return new BusinessRuleException(
      'INVOICE_ALREADY_PAID',
      `Invoice ${invoiceNumber} has already been paid (${paidAmount})`,
      {
        constraint: 'payment_status',
        value: paidAmount,
        metadata: { invoiceNumber },
      },
    );
  }

  static paymentExceedsBalance(amount: number, balance: number) {
    return new BusinessRuleException(
      'PAYMENT_EXCEEDS_BALANCE',
      `Payment amount ${amount} exceeds outstanding balance ${balance}`,
      {
        field: 'amount',
        value: amount,
        expected: `<= ${balance}`,
      },
    );
  }

  static duplicateDocument(documentType: string, identifier: string) {
    return new BusinessRuleException(
      'DUPLICATE_DOCUMENT',
      `${documentType} with identifier ${identifier} already exists`,
      {
        constraint: 'unique',
        value: identifier,
        metadata: { documentType },
      },
      HttpStatus.CONFLICT,
    );
  }

  static invalidStateTransition(from: string, to: string, allowed: string[]) {
    return new BusinessRuleException(
      'INVALID_STATE_TRANSITION',
      `Cannot transition from ${from} to ${to}. Allowed: ${allowed.join(', ')}`,
      {
        value: { from, to },
        expected: allowed,
      },
    );
  }

  static fiscalYearClosed(year: number) {
    return new BusinessRuleException(
      'FISCAL_YEAR_CLOSED',
      `Fiscal year ${year} is closed and cannot accept new transactions`,
      {
        field: 'fiscal_year',
        value: year,
      },
    );
  }

  static taxRateNotConfigured(taxCode: string) {
    return new BusinessRuleException(
      'TAX_RATE_NOT_CONFIGURED',
      `Tax rate ${taxCode} is not configured`,
      {
        field: 'taxRateId',
        value: taxCode,
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  static currencyMismatch(expected: string, actual: string) {
    return new BusinessRuleException(
      'CURRENCY_MISMATCH',
      `Currency mismatch. Expected: ${expected}, Got: ${actual}`,
      {
        field: 'currencyCode',
        value: actual,
        expected: expected,
      },
    );
  }

  static exchangeRateNotFound(from: string, to: string, date: string) {
    return new BusinessRuleException(
      'EXCHANGE_RATE_NOT_FOUND',
      `Exchange rate not found for ${from} to ${to} on ${date}`,
      {
        metadata: { from, to, date },
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  static accountNotFound(accountId: string) {
    return new BusinessRuleException(
      'ACCOUNT_NOT_FOUND',
      `Account ${accountId} not found or not active`,
      {
        field: 'accountId',
        value: accountId,
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  static negativeBalance(accountName: string, balance: number) {
    return new BusinessRuleException(
      'NEGATIVE_BALANCE',
      `Account ${accountName} would have negative balance: ${balance}`,
      {
        field: 'balance',
        value: balance,
        metadata: { accountName },
      },
    );
  }

  static payrollAlreadyProcessed(period: string) {
    return new BusinessRuleException(
      'PAYROLL_ALREADY_PROCESSED',
      `Payroll for period ${period} has already been processed`,
      {
        field: 'period',
        value: period,
      },
    );
  }

  static employeeNotActive(employeeId: string) {
    return new BusinessRuleException(
      'EMPLOYEE_NOT_ACTIVE',
      `Employee ${employeeId} is not active`,
      {
        field: 'employeeId',
        value: employeeId,
        constraint: 'status === ACTIVE',
      },
    );
  }

  static bomCycleDetected(itemId: string, path: string[]) {
    return new BusinessRuleException(
      'BOM_CYCLE_DETECTED',
      `Circular reference detected in BOM structure`,
      {
        metadata: { itemId, cyclePath: path },
      },
    );
  }

  static organizationLimitReached(resource: string, limit: number) {
    return new BusinessRuleException(
      'ORGANIZATION_LIMIT_REACHED',
      `Organization limit reached for ${resource}. Maximum: ${limit}`,
      {
        constraint: 'limit',
        value: limit,
        metadata: { resource },
      },
      HttpStatus.FORBIDDEN,
    );
  }
}
