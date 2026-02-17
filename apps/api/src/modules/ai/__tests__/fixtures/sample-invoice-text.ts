/**
 * Sample OCR text outputs for testing document processing.
 * These represent realistic invoice/bill text as OCR engines would produce.
 */

/** Clean, well-structured invoice */
export const CLEAN_INVOICE_TEXT = `
ACME CORPORATION LLC
123 Business Street, Suite 100
New York, NY 10001

INVOICE

Invoice Number: INV-2024-0042
Invoice Date: 15/01/2024
Due Date: 14/02/2024
Payment Terms: Net 30

Bill To:
Mizano Inc.
456 Client Avenue
Dubai, UAE

Description                      Qty    Unit Price    Total
Web Development Services          40     150.00      6,000.00
Cloud Hosting (Monthly)            1     299.99        299.99
SSL Certificate (Annual)           1      79.99         79.99
Database Maintenance               8     125.00      1,000.00

                              Subtotal:              7,379.98
                              VAT (5%):                369.00
                              Grand Total:           7,748.98

Payment Method: Bank Transfer
Bank: First National Bank
Account: 1234567890
SWIFT: FNBKUS33
`;

/** Invoice with noisy/partial OCR output */
export const NOISY_INVOICE_TEXT = `
Gl0bal Tech S0lutions Inc
4S7 lndustrial Blvd
Lon don, UK EC1A 1BB

lNVOlCE #: GT-2024-108
Date: 2024-03-22

Desc ription              Qty   Price     Amount
Consult ing Services       20   200.OO    4,OOO.OO
Softw are License           1   l,500.00  l,500.00

Sub total:                              5,5OO.OO
Tax (20%):                              1,1OO.OO
T0TAL:                                  6,6OO.OO
`;

/** Invoice with Arabic text */
export const ARABIC_INVOICE_TEXT = `
شركة الإبداع للتكنولوجيا ذ.م.م
شارع الملك فهد، الرياض
المملكة العربية السعودية

فاتورة ضريبية

رقم الفاتورة: INV-SA-2024-0015
تاريخ الفاتورة: 2024/02/10
الرقم الضريبي: TRN 300123456789003

البيان                    الكمية    السعر      المجموع
خدمات تطوير البرمجيات      100    250.00    25,000.00
استضافة سحابية               12    500.00     6,000.00

المجموع الفرعي:                             31,000.00
ضريبة القيمة المضافة (15%):                  4,650.00
الإجمالي:                                   35,650.00
`;

/** Receipt-style document */
export const RECEIPT_TEXT = `
COFFEE SHOP EXPRESS
1234 Main St, Downtown

Date: 01/15/2024 14:32

Cappuccino           x2    $4.50    $9.00
Croissant            x1    $3.25    $3.25
Sandwich             x1    $7.99    $7.99

Subtotal:                         $20.24
Tax (8.25%):                       $1.67
Total:                            $21.91

Card ending: **** 4567
Thank you!
`;

/** Invoice with European number format */
export const EUROPEAN_FORMAT_INVOICE = `
GMBH Solutions GmbH
Hauptstraße 42
80331 München, Deutschland

Rechnung Nr: RE-2024-0033
Datum: 22.03.2024

Beschreibung                 Menge    Einzelpreis    Gesamt
Beratungsleistungen            15      180,00       2.700,00
Softwareentwicklung            40      150,00       6.000,00
Projektmanagement              10      200,00       2.000,00

Zwischensumme:                                    10.700,00
MwSt (19%):                                        2.033,00
Gesamtbetrag:                                     12.733,00
`;

/** Purchase order document */
export const PURCHASE_ORDER_TEXT = `
PURCHASE ORDER

PO Number: PO-2024-0789
Date: March 15, 2024
Delivery Date: April 1, 2024

From: Mizano Inc.
To: Industrial Supplies Co.

Item Code    Description              Qty    Unit Price    Total
IS-001       Steel Bolts M8x40       500    $0.15         $75.00
IS-002       Steel Nuts M8           500    $0.08         $40.00
IS-003       Washers M8             1000    $0.03         $30.00
IS-004       Spring Washers M8       500    $0.05         $25.00

Subtotal:   $170.00
Shipping:    $15.00
Total:      $185.00
`;

/** Bank statement */
export const BANK_STATEMENT_TEXT = `
FIRST NATIONAL BANK
Account Statement

Account Number: 1234-5678-9012
Period: January 1, 2024 - January 31, 2024

Date        Description                    Debit      Credit     Balance
01/02/2024  Opening Balance                                     10,000.00
01/05/2024  Wire Transfer - Client A                 5,000.00   15,000.00
01/08/2024  Office Rent                   2,500.00              12,500.00
01/15/2024  Utility Payment                 450.00              12,050.00
01/20/2024  Wire Transfer - Client B                 3,200.00   15,250.00
01/25/2024  Insurance Premium               800.00              14,450.00
01/31/2024  Closing Balance                                     14,450.00
`;

/** Minimal/poor quality invoice */
export const MINIMAL_INVOICE_TEXT = `
Invoice
Date: Jan 5, 2024
Amount Due: $1,500.00
`;

/** Duplicate invoice for testing duplicate detection */
export const DUPLICATE_INVOICE_A = {
  vendorName: 'Acme Corp',
  invoiceNumber: 'INV-2024-0042',
  total: 7748.98,
  date: new Date('2024-01-15'),
};

export const DUPLICATE_INVOICE_B = {
  vendorName: 'Acme Corp',
  invoiceNumber: 'INV-2024-0042',
  total: 7748.98,
  date: new Date('2024-01-15'),
};
