import { BRAND } from '@mizano/shared-types';
import { McpLocale } from '../mcp-locale';

/**
 * Every line an AI app shows the person, in both languages (the type requires both). Kept short:
 * the app turns them into its own reply. Data values travel separately as structured content.
 */
type Text = { ar: string; en: string };
type Fn<A extends unknown[]> = (...args: A) => Text;

export const MCP_TEXT = {
  found: ((count: number, what: Text) => ({
    ar: `${count} ${what.ar}`,
    en: `${count} ${what.en}`,
  })) as Fn<[number, Text]>,
  customers: { ar: 'عميل', en: 'customer(s)' },
  vendors: { ar: 'مورد', en: 'vendor(s)' },
  items: { ar: 'صنف', en: 'item(s)' },
  invoices: { ar: 'فاتورة مبيعات', en: 'invoice(s)' },
  bills: { ar: 'فاتورة مشتريات', en: 'bill(s)' },
  payments: { ar: 'دفعة', en: 'payment(s)' },
  invoice: ((n: string) => ({ ar: `الفاتورة ${n}`, en: `Invoice ${n}` })) as Fn<[string]>,
  bill: ((n: string) => ({ ar: `فاتورة المشتريات ${n}`, en: `Bill ${n}` })) as Fn<[string]>,
  arAging: ((asOf: string) => ({
    ar: `أعمار الذمم المدينة حتى ${asOf}`,
    en: `Receivables aging as of ${asOf}`,
  })) as Fn<[string]>,
  apAging: ((asOf: string) => ({
    ar: `أعمار الذمم الدائنة حتى ${asOf}`,
    en: `Payables aging as of ${asOf}`,
  })) as Fn<[string]>,
  profitAndLoss: ((from: string, to: string) => ({
    ar: `الأرباح والخسائر من ${from} إلى ${to}`,
    en: `Profit and loss from ${from} to ${to}`,
  })) as Fn<[string, string]>,
  balanceSheet: ((asOf: string) => ({
    ar: `الميزانية العمومية حتى ${asOf}`,
    en: `Balance sheet as of ${asOf}`,
  })) as Fn<[string]>,
  cashSummary: ((from: string, to: string) => ({
    ar: `ملخص النقدية من ${from} إلى ${to}`,
    en: `Cash summary from ${from} to ${to}`,
  })) as Fn<[string, string]>,
  vatSummary: ((from: string, to: string) => ({
    ar: `ملخص ضريبة القيمة المضافة من ${from} إلى ${to}`,
    en: `VAT summary from ${from} to ${to}`,
  })) as Fn<[string, string]>,
  accountOptions: {
    ar: 'حسابات المصروفات وحسابات الدفع (بنك أو نقدية) المتاحة',
    en: 'Expense accounts and bank or cash accounts you can pay from',
  },
  draftSaved: ((what: Text, number: string) => ({
    ar: `تم حفظ ${what.ar} ${number} كمسودة. لم يُرحَّل أو يُرسل أو يُدفع أي شيء: راجع المسودة في ${BRAND.name.ar} ثم رحّلها بنفسك.`,
    en: `Saved ${what.en} ${number} as a draft. Nothing was posted, sent or paid: review it in ${BRAND.name.en} and post it yourself.`,
  })) as Fn<[Text, string]>,
  quoteNoun: { ar: 'عرض السعر', en: 'quote' },
  invoiceNoun: { ar: 'الفاتورة', en: 'invoice' },
  billNoun: { ar: 'فاتورة المشتريات', en: 'bill' },
  expenseNoun: { ar: 'المصروف', en: 'expense' },
  notFound: { ar: 'لم يُعثر عليه في هذه المؤسسة.', en: 'Not found in this organization.' },
  noPermission: ((permission: string) => ({
    ar: `دورك في ${BRAND.name.ar} لا يسمح بهذا (يلزم ${permission}).`,
    en: `Your role in ${BRAND.name.en} does not allow this (needs ${permission}).`,
  })) as Fn<[string]>,
  invalid: ((fields: string) => ({
    ar: `بيانات غير صحيحة في: ${fields}`,
    en: `Please check these fields: ${fields}`,
  })) as Fn<[string]>,
  refused: ((reason: string) => ({
    ar: `رفضت ${BRAND.name.ar} الطلب: ${reason}`,
    en: `${BRAND.name.en} refused this: ${reason}`,
  })) as Fn<[string]>,
  failed: {
    ar: 'تعذّر إكمال الطلب الآن. حاول مرة أخرى بعد قليل.',
    en: 'This could not be completed right now. Please try again shortly.',
  },
} as const;

export function say(text: Text, locale: McpLocale): string {
  return text[locale] || text.en;
}
