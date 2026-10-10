import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PdfService } from './pdf.service';
import {
  SendDocumentDto,
  InvoiceEmailContext,
  QuoteEmailContext,
  PayslipEmailContext,
} from '../dto/documents.dto';
import { escapeHtml, formatCurrency, formatDate, safeColor } from '../templates/base.template';
import nodemailer from 'nodemailer';
import type { Attachment } from 'nodemailer/lib/mailer';

import { CacheService } from '../../../cache/cache.service';
import { describeError } from '../../../common/utils/redact';

const DEFAULT_MIN_DAILY = 50;
const WARM_UP_FULL_DAYS = 7;
const BASELINE_FULL_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Alert state outlives the 5-minute cache default so one alert covers a whole incident. */
const ALERT_STATE_TTL_SECONDS = 7 * 24 * 60 * 60;
const TELEGRAM_TIMEOUT_MS = 5000;
/** Outlives the bounded Telegram call, so a crashed holder cannot block alerts for long. */
const ALERT_CLAIM_TTL_SECONDS = 30;

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private prisma: PrismaService,
    private pdfService: PdfService,
    private cacheService: CacheService,
  ) {}

  // ============ Invoice Emails ============

  async sendInvoice(
    organizationId: string,
    invoiceId: string,
    dto: SendDocumentDto,
  ): Promise<{ success: boolean; emailLogId?: string; error?: string }> {
    try {
      const invoice = await this.prisma.invoice.findFirst({
        where: { id: invoiceId, organizationId, deletedAt: null },
        include: {
          customer: true,
        },
      });

      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }

      const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
      });

      if (!org) {
        throw new NotFoundException('Organization not found');
      }

      const context: InvoiceEmailContext = {
        organizationName: org.name,
        customerName: invoice.customer.name,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: formatDate(invoice.date),
        dueDate: formatDate(invoice.dueDate),
        grandTotal: formatCurrency(
          parseFloat(invoice.grandTotal.toString()),
          invoice.currencyCode || 'SAR',
        ),
        currency: invoice.currencyCode || 'SAR',
      };

      const subject = dto.subject || `Invoice ${invoice.invoiceNumber} from ${org.name}`;
      const message = dto.message || this.getDefaultInvoiceMessage(context);

      let attachments: Attachment[] = [];
      if (dto.attachPdf !== false) {
        const pdfBuffer = await this.pdfService.generateInvoicePdf(organizationId, invoiceId);
        attachments = [
          {
            filename: `${invoice.invoiceNumber}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ];
      }

      await this.sendEmail(organizationId, {
        to: dto.to,
        cc: dto.cc,
        bcc: dto.bcc,
        subject,
        html: this.wrapInEmailTemplate(org.name, message, org.primaryColor ?? undefined),
        attachments,
      });

      // Log the email
      const emailLog = await this.prisma.emailLog.create({
        data: {
          to: dto.to,
          subject,
          entityType: 'invoice',
          entityId: invoiceId,
          status: 'sent',
          organizationId,
        },
      });

      await this.checkVolumeAnomalySafely(organizationId);

      return { success: true, emailLogId: emailLog.id };
    } catch (error: unknown) {
      // Log the failed email
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.prisma.emailLog.create({
        data: {
          to: dto.to,
          subject: dto.subject || 'Invoice',
          entityType: 'invoice',
          entityId: invoiceId,
          status: 'failed',
          error: errorMessage,
          organizationId,
        },
      });

      await this.checkVolumeAnomalySafely(organizationId);

      return { success: false, error: errorMessage };
    }
  }

  // ============ Quote Emails ============

  async sendQuote(
    organizationId: string,
    quoteId: string,
    dto: SendDocumentDto,
  ): Promise<{ success: boolean; emailLogId?: string; error?: string }> {
    try {
      const quote = await this.prisma.quote.findFirst({
        where: { id: quoteId, organizationId, deletedAt: null },
        include: {
          customer: true,
        },
      });

      if (!quote) {
        throw new NotFoundException('Quote not found');
      }

      const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
      });

      if (!org) {
        throw new NotFoundException('Organization not found');
      }

      const context: QuoteEmailContext = {
        organizationName: org.name,
        customerName: quote.customer.name,
        quoteNumber: quote.quoteNumber,
        quoteDate: formatDate(quote.date),
        expiryDate: formatDate(quote.expiryDate),
        grandTotal: formatCurrency(
          parseFloat(quote.grandTotal.toString()),
          quote.currencyCode || 'SAR',
        ),
        currency: quote.currencyCode || 'SAR',
      };

      const subject = dto.subject || `Quote ${quote.quoteNumber} from ${org.name}`;
      const message = dto.message || this.getDefaultQuoteMessage(context);

      let attachments: Attachment[] = [];
      if (dto.attachPdf !== false) {
        const pdfBuffer = await this.pdfService.generateQuotePdf(organizationId, quoteId);
        attachments = [
          {
            filename: `${quote.quoteNumber}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ];
      }

      await this.sendEmail(organizationId, {
        to: dto.to,
        cc: dto.cc,
        bcc: dto.bcc,
        subject,
        html: this.wrapInEmailTemplate(org.name, message, org.primaryColor ?? undefined),
        attachments,
      });

      const emailLog = await this.prisma.emailLog.create({
        data: {
          to: dto.to,
          subject,
          entityType: 'quote',
          entityId: quoteId,
          status: 'sent',
          organizationId,
        },
      });

      return { success: true, emailLogId: emailLog.id };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.prisma.emailLog.create({
        data: {
          to: dto.to,
          subject: dto.subject || 'Quote',
          entityType: 'quote',
          entityId: quoteId,
          status: 'failed',
          error: errorMessage,
          organizationId,
        },
      });

      return { success: false, error: errorMessage };
    }
  }

  // ============ Payslip Emails ============

  async sendPayslip(
    organizationId: string,
    payslipId: string,
    dto?: Partial<SendDocumentDto>,
  ): Promise<{ success: boolean; emailLogId?: string; error?: string }> {
    // A payslip must never be resolved by id alone: the organization is mandatory and every
    // lookup below (including the failure path) is scoped through the payroll run's organization.
    if (!organizationId) {
      throw new BadRequestException('organizationId is required to send a payslip');
    }

    try {
      const payslip = await this.prisma.payslip.findFirst({
        where: {
          id: payslipId,
          payrollRun: { organizationId },
        },
        include: {
          employee: true,
          payrollRun: true,
        },
      });

      if (!payslip) {
        throw new NotFoundException('Payslip not found');
      }

      if (!payslip.employee.email) {
        throw new BadRequestException('Employee does not have an email address');
      }

      const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
      });

      if (!org) {
        throw new NotFoundException('Organization not found');
      }

      // Construct fallback dates from payrollRun month/year if periodStart/End not set
      const { month, year } = payslip.payrollRun;
      const defaultPeriodStart = new Date(year, month - 1, 1);
      const defaultPeriodEnd = new Date(year, month, 0);
      const defaultPayDate = new Date(year, month - 1, 28);

      const periodStart = payslip.payrollRun.periodStart ?? defaultPeriodStart;
      const periodEnd = payslip.payrollRun.periodEnd ?? defaultPeriodEnd;
      const payDate = payslip.payrollRun.payDate ?? defaultPayDate;

      const payPeriod = `${formatDate(periodStart)} - ${formatDate(periodEnd)}`;

      const context: PayslipEmailContext = {
        organizationName: org.name,
        employeeName: payslip.employee.name,
        payPeriod,
        payDate: formatDate(payDate),
        netPay: formatCurrency(parseFloat((payslip.netPay || payslip.netSalary).toString()), 'SAR'),
        currency: 'SAR',
      };

      const subject = dto?.subject || `Your Payslip for ${payPeriod} - ${org.name}`;
      const message = dto?.message || this.getDefaultPayslipMessage(context);

      const pdfBuffer = await this.pdfService.generatePayslipPdf(organizationId, payslipId);
      const attachments: Attachment[] = [
        {
          filename: `Payslip-${payPeriod.replace(/\s/g, '_')}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ];

      await this.sendEmail(organizationId, {
        to: payslip.employee.email,
        subject,
        html: this.wrapInEmailTemplate(org.name, message, org.primaryColor ?? undefined),
        attachments,
      });

      const emailLog = await this.prisma.emailLog.create({
        data: {
          to: payslip.employee.email,
          subject,
          entityType: 'payslip',
          entityId: payslipId,
          status: 'sent',
          organizationId,
        },
      });

      return { success: true, emailLogId: emailLog.id };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Same tenant scoping as the happy path: never read another organization's employee e-mail.
      const payslip = await this.prisma.payslip.findFirst({
        where: { id: payslipId, payrollRun: { organizationId } },
        select: { employee: { select: { email: true } } },
      });

      await this.prisma.emailLog.create({
        data: {
          to: payslip?.employee?.email || 'unknown',
          subject: 'Payslip',
          entityType: 'payslip',
          entityId: payslipId,
          status: 'failed',
          error: errorMessage,
          organizationId,
        },
      });

      return { success: false, error: errorMessage };
    }
  }

  async sendAllPayslips(
    organizationId: string,
    payrollRunId: string,
    options?: { subjectTemplate?: string; messageTemplate?: string },
  ): Promise<{
    total: number;
    sent: number;
    failed: number;
    errors: Array<{ employeeId: string; error: string }>;
  }> {
    const payrollRun = await this.prisma.payrollRun.findFirst({
      where: { id: payrollRunId, organizationId },
      include: {
        payslips: {
          include: { employee: true },
        },
      },
    });

    if (!payrollRun) {
      throw new NotFoundException('Payroll run not found');
    }

    const results = {
      total: payrollRun.payslips.length,
      sent: 0,
      failed: 0,
      errors: [] as Array<{ employeeId: string; error: string }>,
    };

    for (const payslip of payrollRun.payslips) {
      const result = await this.sendPayslip(organizationId, payslip.id, {
        subject: options?.subjectTemplate,
        message: options?.messageTemplate,
      });

      if (result.success) {
        results.sent++;
      } else {
        results.failed++;
        results.errors.push({
          employeeId: payslip.employeeId,
          error: result.error || 'Unknown error',
        });
      }
    }

    return results;
  }

  // ============ Helper Methods ============

  private async sendEmail(
    organizationId: string,
    options: {
      to: string;
      cc?: string[];
      bcc?: string[];
      subject: string;
      html: string;
      attachments?: Attachment[];
    },
  ): Promise<void> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        smtpHost: true,
        smtpPort: true,
        smtpUser: true,
        smtpPassword: true,
        smtpFromEmail: true,
        name: true,
      },
    });

    if (!org?.smtpHost || !org?.smtpUser || !org?.smtpPassword) {
      throw new BadRequestException(
        'Email is not configured. Please set up SMTP settings in organization settings.',
      );
    }

    const transporter = nodemailer.createTransport({
      host: org.smtpHost,
      port: org.smtpPort || 587,
      secure: org.smtpPort === 465,
      auth: {
        user: org.smtpUser,
        pass: org.smtpPassword,
      },
    });

    await transporter.sendMail({
      from: org.smtpFromEmail || org.smtpUser,
      to: options.to,
      cc: options.cc?.join(', '),
      bcc: options.bcc?.join(', '),
      subject: options.subject,
      html: options.html,
      attachments: options.attachments,
    });
  }

  private wrapInEmailTemplate(orgName: string, content: string, primaryColor?: string): string {
    const color = safeColor(primaryColor, '#3B82F6');
    const safeOrgName = escapeHtml(orgName);

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #F3F4F6;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F3F4F6; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #FFFFFF; border-radius: 8px; overflow: hidden;">
                <!-- Header -->
                <tr>
                  <td style="background-color: ${color}; padding: 30px; text-align: center;">
                    <h1 style="color: #FFFFFF; margin: 0; font-size: 24px;">${safeOrgName}</h1>
                  </td>
                </tr>
                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    ${content}
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background-color: #F9FAFB; padding: 20px 30px; text-align: center; border-top: 1px solid #E5E7EB;">
                    <p style="margin: 0; color: #9CA3AF; font-size: 12px;">
                      This email was sent by ${safeOrgName}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  private getDefaultInvoiceMessage(context: InvoiceEmailContext): string {
    return `
      <p style="color: #111827; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
        Dear ${escapeHtml(context.customerName)},
      </p>
      <p style="color: #4B5563; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
        Please find attached invoice <strong>${escapeHtml(context.invoiceNumber)}</strong> for <strong>${escapeHtml(context.grandTotal)}</strong>.
      </p>
      <table style="width: 100%; background-color: #F9FAFB; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <tr>
          <td style="padding: 10px;">
            <p style="margin: 0; color: #6B7280; font-size: 12px;">Invoice Number</p>
            <p style="margin: 5px 0 0 0; color: #111827; font-weight: bold;">${escapeHtml(context.invoiceNumber)}</p>
          </td>
          <td style="padding: 10px;">
            <p style="margin: 0; color: #6B7280; font-size: 12px;">Invoice Date</p>
            <p style="margin: 5px 0 0 0; color: #111827; font-weight: bold;">${escapeHtml(context.invoiceDate)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 10px;">
            <p style="margin: 0; color: #6B7280; font-size: 12px;">Due Date</p>
            <p style="margin: 5px 0 0 0; color: #111827; font-weight: bold;">${escapeHtml(context.dueDate)}</p>
          </td>
          <td style="padding: 10px;">
            <p style="margin: 0; color: #6B7280; font-size: 12px;">Amount Due</p>
            <p style="margin: 5px 0 0 0; color: #111827; font-weight: bold; font-size: 18px;">${escapeHtml(context.grandTotal)}</p>
          </td>
        </tr>
      </table>
      <p style="color: #4B5563; font-size: 14px; line-height: 1.6;">
        If you have any questions, please don't hesitate to contact us.
      </p>
      <p style="color: #4B5563; font-size: 14px; line-height: 1.6; margin-top: 20px;">
        Thank you for your business!
      </p>
      <p style="color: #111827; font-size: 14px; margin-top: 30px;">
        Best regards,<br>
        <strong>${escapeHtml(context.organizationName)}</strong>
      </p>
    `;
  }

  private getDefaultQuoteMessage(context: QuoteEmailContext): string {
    return `
      <p style="color: #111827; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
        Dear ${escapeHtml(context.customerName)},
      </p>
      <p style="color: #4B5563; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
        Thank you for your interest! Please find attached our quotation <strong>${escapeHtml(context.quoteNumber)}</strong>.
      </p>
      <table style="width: 100%; background-color: #F9FAFB; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <tr>
          <td style="padding: 10px;">
            <p style="margin: 0; color: #6B7280; font-size: 12px;">Quote Number</p>
            <p style="margin: 5px 0 0 0; color: #111827; font-weight: bold;">${escapeHtml(context.quoteNumber)}</p>
          </td>
          <td style="padding: 10px;">
            <p style="margin: 0; color: #6B7280; font-size: 12px;">Quote Date</p>
            <p style="margin: 5px 0 0 0; color: #111827; font-weight: bold;">${escapeHtml(context.quoteDate)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 10px;">
            <p style="margin: 0; color: #6B7280; font-size: 12px;">Valid Until</p>
            <p style="margin: 5px 0 0 0; color: #111827; font-weight: bold;">${escapeHtml(context.expiryDate)}</p>
          </td>
          <td style="padding: 10px;">
            <p style="margin: 0; color: #6B7280; font-size: 12px;">Total Amount</p>
            <p style="margin: 5px 0 0 0; color: #111827; font-weight: bold; font-size: 18px;">${escapeHtml(context.grandTotal)}</p>
          </td>
        </tr>
      </table>
      <p style="color: #4B5563; font-size: 14px; line-height: 1.6;">
        Please review the attached quote. If you have any questions or would like to proceed, don't hesitate to contact us.
      </p>
      <p style="color: #111827; font-size: 14px; margin-top: 30px;">
        Best regards,<br>
        <strong>${escapeHtml(context.organizationName)}</strong>
      </p>
    `;
  }

  private getDefaultPayslipMessage(context: PayslipEmailContext): string {
    return `
      <p style="color: #111827; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
        Dear ${escapeHtml(context.employeeName)},
      </p>
      <p style="color: #4B5563; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
        Your payslip for the pay period <strong>${escapeHtml(context.payPeriod)}</strong> is now available.
      </p>
      <table style="width: 100%; background-color: #F9FAFB; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <tr>
          <td style="padding: 10px;">
            <p style="margin: 0; color: #6B7280; font-size: 12px;">Pay Period</p>
            <p style="margin: 5px 0 0 0; color: #111827; font-weight: bold;">${escapeHtml(context.payPeriod)}</p>
          </td>
          <td style="padding: 10px;">
            <p style="margin: 0; color: #6B7280; font-size: 12px;">Pay Date</p>
            <p style="margin: 5px 0 0 0; color: #111827; font-weight: bold;">${escapeHtml(context.payDate)}</p>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="padding: 10px; text-align: center;">
            <p style="margin: 0; color: #6B7280; font-size: 12px;">Net Pay</p>
            <p style="margin: 5px 0 0 0; color: #10B981; font-weight: bold; font-size: 24px;">${escapeHtml(context.netPay)}</p>
          </td>
        </tr>
      </table>
      <p style="color: #4B5563; font-size: 14px; line-height: 1.6;">
        Please find your detailed payslip attached. If you have any questions, contact the HR department.
      </p>
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 20px;">
        This is an automated email. Please do not reply.
      </p>
    `;
  }

  // ============ Email Logs ============

  async getEmailLogs(
    organizationId: string,
    options?: {
      entityType?: string;
      entityId?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ data: unknown[]; total: number }> {
    const where: Record<string, unknown> = { organizationId };

    if (options?.entityType) where.entityType = options.entityType;
    if (options?.entityId) where.entityId = options.entityId;

    const [data, total] = await Promise.all([
      this.prisma.emailLog.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        take: options?.limit || 50,
        skip: options?.offset || 0,
      }),
      this.prisma.emailLog.count({ where }),
    ]);

    return { data, total };
  }

  // ============ Anomaly Alert ============

  /** Notify-only: a failing check must never change the outcome of the send itself. */
  private async checkVolumeAnomalySafely(organizationId: string): Promise<void> {
    try {
      await this.checkVolumeAnomaly(organizationId);
    } catch (error: unknown) {
      this.logger.error(
        `Volume anomaly check failed: ${describeError(error, { includeMessage: false })}`,
      );
    }
  }

  /**
   * Compares today's invoice send attempts (sent and failed) with
   * max(floor, 2 x mean of the last 30 full UTC days) and alerts once per incident.
   */
  async checkVolumeAnomaly(organizationId: string): Promise<void> {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const windowStart = new Date(todayStart.getTime() - BASELINE_FULL_DAYS * MS_PER_DAY);

    const [todayCount, historyCount, firstLog] = await Promise.all([
      this.prisma.emailLog.count({
        where: { organizationId, entityType: 'invoice', sentAt: { gte: todayStart } },
      }),
      this.prisma.emailLog.count({
        where: {
          organizationId,
          entityType: 'invoice',
          sentAt: { gte: windowStart, lt: todayStart },
        },
      }),
      this.prisma.emailLog.findFirst({
        where: { organizationId, entityType: 'invoice' },
        orderBy: { sentAt: 'asc' },
        select: { sentAt: true },
      }),
    ]);

    const floor = this.getMinDaily();
    let threshold = floor;
    if (firstLog) {
      const firstDay = new Date(firstLog.sentAt);
      firstDay.setUTCHours(0, 0, 0, 0);
      const fullDays = Math.min(
        BASELINE_FULL_DAYS,
        Math.floor((todayStart.getTime() - firstDay.getTime()) / MS_PER_DAY),
      );
      // Until 7 full days exist only the floor applies; from day 8 the baseline uses what exists.
      if (fullDays > WARM_UP_FULL_DAYS) {
        threshold = Math.max(floor, Math.floor((2 * historyCount) / fullDays));
      }
    }

    const stateKey = `notify-volume-${organizationId}`;
    const alerting = (await this.cacheService.get<boolean>(stateKey)) === true;
    const shouldAlert = todayCount > threshold && !alerting;
    const shouldRecover = todayCount <= threshold && alerting;
    if (!shouldAlert && !shouldRecover) return;

    // Concurrent sends cross the threshold together: only the request holding the claim may notify.
    const claimKey = `${stateKey}-claim`;
    if (!(await this.cacheService.claim(claimKey, ALERT_CLAIM_TTL_SECONDS))) return;
    try {
      // Another request may have finished the same transition between our read and our claim.
      if (((await this.cacheService.get<boolean>(stateKey)) === true) !== alerting) return;

      // Dedupe state is recorded only after Telegram confirms delivery, so a failed call is retried.
      const delivered = await this.notifyTelegram(
        shouldAlert
          ? `[Mizano] ALERT: Outbound invoice email volume anomaly. Count: ${todayCount}, Threshold: ${threshold}`
          : `[Mizano] RECOVERED: Outbound invoice email volume back to normal. Count: ${todayCount}, Threshold: ${threshold}`,
      );
      if (delivered) {
        await this.cacheService.set(stateKey, shouldAlert, { ttl: ALERT_STATE_TTL_SECONDS });
      }
    } finally {
      await this.cacheService.releaseClaim(claimKey);
    }
  }

  private getMinDaily(): number {
    const parsed = Number.parseInt(process.env.NOTIFY_ANOMALY_MIN_DAILY ?? '', 10);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULT_MIN_DAILY;
  }

  /** Returns true only when Telegram accepted the message. */
  private async notifyTelegram(message: string): Promise<boolean> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_ALERT_CHAT_ID;
    if (!token || !chatId) return false;

    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message }),
        signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn(`Telegram alert rejected: status=${response.status}`);
        return false;
      }
      return true;
    } catch (error: unknown) {
      // The request URL carries the bot token, so never log the raw error.
      this.logger.warn(
        `Telegram alert not delivered: ${describeError(error, { includeMessage: false })}`,
      );
      return false;
    }
  }
}
