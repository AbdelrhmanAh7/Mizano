import { OrganizationInfo } from './base.template';
import { generatePayslipHtml, PayslipData } from './payslip.template';

describe('payslip.template employee jobTitle and position support', () => {
  const org: OrganizationInfo = {
    name: 'Mizano Corp',
    currency: 'SAR',
  };

  const createBasePayslip = (): PayslipData => ({
    payslipNumber: 'PS-1001',
    payPeriodStart: '2026-10-01',
    payPeriodEnd: '2026-10-31',
    payDate: '2026-10-28',
    employee: {
      name: 'Ahmed Hassan',
      employeeId: 'EMP-042',
      department: 'Finance',
    },
    earnings: [{ description: 'Base Salary', amount: 5000, isGross: true }],
    deductions: [],
    grossPay: 5000,
    totalDeductions: 0,
    netPay: 5000,
    currency: 'SAR',
  });

  it('renders Position when only jobTitle is provided on employee', () => {
    const payslip = createBasePayslip();
    payslip.employee.jobTitle = 'Senior Financial Analyst';

    const html = generatePayslipHtml(org, payslip);
    expect(html).toContain('Position:');
    expect(html).toContain('Senior Financial Analyst');
  });

  it('renders Position when only position is provided on employee', () => {
    const payslip = createBasePayslip();
    payslip.employee.position = 'Chief Accountant';

    const html = generatePayslipHtml(org, payslip);
    expect(html).toContain('Position:');
    expect(html).toContain('Chief Accountant');
  });

  it('prefers position over jobTitle when both are provided', () => {
    const payslip = createBasePayslip();
    payslip.employee.position = 'Lead Auditor';
    payslip.employee.jobTitle = 'Auditor';

    const html = generatePayslipHtml(org, payslip);
    expect(html).toContain('Position:');
    expect(html).toContain('Lead Auditor');
    expect(html).not.toContain('<td>Auditor</td>');
  });

  it('omits Position row when neither position nor jobTitle is provided', () => {
    const payslip = createBasePayslip();

    const html = generatePayslipHtml(org, payslip);
    expect(html).not.toContain('Position:');
  });

  it('escapes jobTitle HTML characters safely', () => {
    const payslip = createBasePayslip();
    payslip.employee.jobTitle = '<script>alert("xss")</script>Analyst';

    const html = generatePayslipHtml(org, payslip);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;Analyst');
  });
});
