import {
  OrganizationInfo,
  formatCurrency,
  formatDate,
  generateHeaderHtml,
  defaultTemplateConfig,
  escapeHtml,
  safeColor,
} from './base.template';

export interface PayslipData {
  payslipNumber: string;
  payPeriodStart: Date | string;
  payPeriodEnd: Date | string;
  payDate: Date | string;
  employee: {
    name: string;
    employeeId: string;
    department?: string;
    position?: string;
    email?: string;
    bankAccount?: string;
  };
  earnings: Array<{
    description: string;
    amount: number;
    isGross?: boolean;
  }>;
  deductions: Array<{
    description: string;
    amount: number;
  }>;
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  currency: string;
  ytdGross?: number;
  ytdDeductions?: number;
  ytdNet?: number;
}

export function generatePayslipHtml(org: OrganizationInfo, payslip: PayslipData): string {
  const primaryColor = safeColor(org.primaryColor, defaultTemplateConfig.colors.primary);

  const payPeriod = `${formatDate(payslip.payPeriodStart)} - ${formatDate(payslip.payPeriodEnd)}`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Payslip - ${escapeHtml(payslip.employee.name)}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #111827; line-height: 1.5; }
        .container { max-width: 800px; margin: 0 auto; padding: 40px; }
        @media print {
          .container { padding: 20px; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        ${generateHeaderHtml(org, primaryColor)}

        <!-- Payslip Title -->
        <div style="text-align: center; margin-bottom: 30px;">
          <h2 style="font-size: 24px; color: ${primaryColor}; margin-bottom: 5px;">PAYSLIP</h2>
          <p style="color: #6B7280; font-size: 14px;">${payPeriod}</p>
        </div>

        <!-- Employee Details -->
        <div style="display: flex; justify-content: space-between; margin-bottom: 30px; background: ${defaultTemplateConfig.colors.lightGray}; padding: 20px; border-radius: 8px;">
          <div style="flex: 1;">
            <h4 style="color: ${primaryColor}; margin-bottom: 10px; font-size: 12px; text-transform: uppercase;">Employee Details</h4>
            <table style="font-size: 12px;">
              <tr>
                <td style="padding: 3px 15px 3px 0; color: #6B7280;">Name:</td>
                <td style="font-weight: bold;">${escapeHtml(payslip.employee.name)}</td>
              </tr>
              <tr>
                <td style="padding: 3px 15px 3px 0; color: #6B7280;">Employee ID:</td>
                <td>${escapeHtml(payslip.employee.employeeId)}</td>
              </tr>
              ${
                payslip.employee.department
                  ? `
                <tr>
                  <td style="padding: 3px 15px 3px 0; color: #6B7280;">Department:</td>
                  <td>${escapeHtml(payslip.employee.department)}</td>
                </tr>
              `
                  : ''
              }
              ${
                payslip.employee.position
                  ? `
                <tr>
                  <td style="padding: 3px 15px 3px 0; color: #6B7280;">Position:</td>
                  <td>${escapeHtml(payslip.employee.position)}</td>
                </tr>
              `
                  : ''
              }
            </table>
          </div>
          <div style="text-align: right;">
            <table style="margin-left: auto; font-size: 12px;">
              <tr>
                <td style="padding: 3px 15px 3px 0; color: #6B7280;">Payslip No:</td>
                <td style="font-weight: bold;">${escapeHtml(payslip.payslipNumber)}</td>
              </tr>
              <tr>
                <td style="padding: 3px 15px 3px 0; color: #6B7280;">Pay Date:</td>
                <td style="font-weight: bold;">${formatDate(payslip.payDate)}</td>
              </tr>
              ${
                payslip.employee.bankAccount
                  ? `
                <tr>
                  <td style="padding: 3px 15px 3px 0; color: #6B7280;">Bank Account:</td>
                  <td>${escapeHtml(payslip.employee.bankAccount)}</td>
                </tr>
              `
                  : ''
              }
            </table>
          </div>
        </div>

        <!-- Earnings and Deductions -->
        <div style="display: flex; gap: 30px; margin-bottom: 30px;">
          <!-- Earnings -->
          <div style="flex: 1;">
            <h4 style="color: ${primaryColor}; margin-bottom: 15px; font-size: 12px; text-transform: uppercase; border-bottom: 2px solid ${primaryColor}; padding-bottom: 5px;">
              Earnings
            </h4>
            <table style="width: 100%; font-size: 12px;">
              ${payslip.earnings
                .map(
                  (e) => `
                <tr style="border-bottom: 1px solid ${defaultTemplateConfig.colors.border};">
                  <td style="padding: 8px 0;">${escapeHtml(e.description)}</td>
                  <td style="padding: 8px 0; text-align: right; font-weight: ${e.isGross ? 'bold' : 'normal'};">
                    ${formatCurrency(e.amount, payslip.currency)}
                  </td>
                </tr>
              `,
                )
                .join('')}
              <tr style="background: ${defaultTemplateConfig.colors.lightGray};">
                <td style="padding: 10px 0; font-weight: bold;">Gross Pay</td>
                <td style="padding: 10px 0; text-align: right; font-weight: bold; font-size: 14px;">
                  ${formatCurrency(payslip.grossPay, payslip.currency)}
                </td>
              </tr>
            </table>
          </div>

          <!-- Deductions -->
          <div style="flex: 1;">
            <h4 style="color: #EF4444; margin-bottom: 15px; font-size: 12px; text-transform: uppercase; border-bottom: 2px solid #EF4444; padding-bottom: 5px;">
              Deductions
            </h4>
            <table style="width: 100%; font-size: 12px;">
              ${
                payslip.deductions.length > 0
                  ? payslip.deductions
                      .map(
                        (d) => `
                <tr style="border-bottom: 1px solid ${defaultTemplateConfig.colors.border};">
                  <td style="padding: 8px 0;">${escapeHtml(d.description)}</td>
                  <td style="padding: 8px 0; text-align: right; color: #EF4444;">
                    -${formatCurrency(d.amount, payslip.currency)}
                  </td>
                </tr>
              `,
                      )
                      .join('')
                  : `
                <tr style="border-bottom: 1px solid ${defaultTemplateConfig.colors.border};">
                  <td style="padding: 8px 0; color: #9CA3AF;">No deductions</td>
                  <td style="padding: 8px 0; text-align: right;">-</td>
                </tr>
              `
              }
              <tr style="background: ${defaultTemplateConfig.colors.lightGray};">
                <td style="padding: 10px 0; font-weight: bold;">Total Deductions</td>
                <td style="padding: 10px 0; text-align: right; font-weight: bold; font-size: 14px; color: #EF4444;">
                  -${formatCurrency(payslip.totalDeductions, payslip.currency)}
                </td>
              </tr>
            </table>
          </div>
        </div>

        <!-- Net Pay -->
        <div style="background: ${primaryColor}; color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 30px;">
          <p style="font-size: 12px; margin-bottom: 5px; opacity: 0.8;">NET PAY</p>
          <p style="font-size: 28px; font-weight: bold;">${formatCurrency(payslip.netPay, payslip.currency)}</p>
        </div>

        <!-- YTD Totals -->
        ${
          payslip.ytdGross
            ? `
          <div style="margin-bottom: 30px;">
            <h4 style="color: ${primaryColor}; margin-bottom: 15px; font-size: 12px; text-transform: uppercase;">Year To Date</h4>
            <div style="display: flex; gap: 20px;">
              <div style="flex: 1; background: ${defaultTemplateConfig.colors.lightGray}; padding: 15px; border-radius: 8px; text-align: center;">
                <p style="font-size: 10px; color: #6B7280; margin-bottom: 5px;">YTD Gross</p>
                <p style="font-size: 16px; font-weight: bold;">${formatCurrency(payslip.ytdGross, payslip.currency)}</p>
              </div>
              <div style="flex: 1; background: ${defaultTemplateConfig.colors.lightGray}; padding: 15px; border-radius: 8px; text-align: center;">
                <p style="font-size: 10px; color: #6B7280; margin-bottom: 5px;">YTD Deductions</p>
                <p style="font-size: 16px; font-weight: bold; color: #EF4444;">-${formatCurrency(payslip.ytdDeductions || 0, payslip.currency)}</p>
              </div>
              <div style="flex: 1; background: ${defaultTemplateConfig.colors.lightGray}; padding: 15px; border-radius: 8px; text-align: center;">
                <p style="font-size: 10px; color: #6B7280; margin-bottom: 5px;">YTD Net</p>
                <p style="font-size: 16px; font-weight: bold; color: ${primaryColor};">${formatCurrency(payslip.ytdNet || 0, payslip.currency)}</p>
              </div>
            </div>
          </div>
        `
            : ''
        }

        <!-- Footer -->
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid ${defaultTemplateConfig.colors.border}; text-align: center;">
          <p style="color: #9CA3AF; font-size: 10px;">
            This is a computer-generated payslip and does not require a signature.
          </p>
          ${org.footerText ? `<p style="color: #9CA3AF; font-size: 10px; margin-top: 10px;">${escapeHtml(org.footerText)}</p>` : ''}
        </div>
      </div>
    </body>
    </html>
  `;
}
