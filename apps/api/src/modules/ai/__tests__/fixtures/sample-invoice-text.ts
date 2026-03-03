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

// ─── Real OCR Output Fixtures ───────────────────────────────────────

/** Real native PDF text from INV-1229.pdf (Transit Hub Shipping) */
export const REAL_INV_1229_TEXT = `1
Total AED1,000.00
Payment Made (-) 1,000.00
Balance Due AED0.00
Invoice Date : 11 Nov 2025
Terms : Due on Receipt
Due Date : 11 Nov 2025
Sales person : Mohamed Yaseen
Transit Hub Shipping L.L.C
Majid Al Ghurair Building,
Al Qusais 2, Al Nahda,
Dubai, 237951,
Dubai UAE
TRN 104303905400003
accounts@transithubshipping.com
TAX INVOICE
# INV-1229
Balance Due
AED0.00
Bill To
Falcon Atlantic Shipping L.L.C
Plot Number 142-0, Majid Sultan Building
Al Muteena
88380 Dubai
U.A.E
# Item & Description Qty Rate Taxable
Amount Tax Amount
1 Storage Fee -Nov'25 1.00 1,000.00 952.38 47.62
5.00%
1,000.00
Sub Total 952.38 47.62 1,000.00
Tax Summary
Tax Details Taxable Amount (AED) Tax Amount (AED)
Standard Rate (5%) 952.38 47.62
Total AED952.38 AED47.62
Notes
Thanks for your business.

-- 1 of 2 --

2

-- 2 of 2 --`;

/** Real native PDF text from INV-1254 (Transit Hub Shipping) */
export const REAL_INV_1254_TEXT = `1
Total AED2,400.00
Payment Made (-) 2,400.00
Balance Due AED0.00
Invoice Date : 29 Nov 2025
Terms : Due on Receipt
Due Date : 29 Nov 2025
Sales person : Mohamed Yaseen
VAT No. : 104183671700003
Transit Hub Shipping L.L.C
Majid Al Ghurair Building,
Al Qusais 2, Al Nahda,
Dubai, 237951,
Dubai UAE
TRN 104303905400003
accounts@transithubshipping.com
TAX INVOICE
# INV-1254
Balance Due
AED0.00
Bill To
Xenhos LLC
Sharjah Media City
Formation- 2113678
Al Mitsannid
Sharjah
U.A.E
TRN 104183671700003
# Item & Description Qty Rate Taxable
Amount Tax Amount
1 Local Delivery Charge(3*3 Ton)(520 Ctns) 1.00 1,200.00 1,142.86 57.14
5.00%
1,200.00
2 Labour and Handling Charge(520 Ctns) 1.00 1,200.00 1,142.86 57.14
5.00%
1,200.00
Sub Total 2,285.72 114.28 2,400.00
Tax Summary
Tax Details Taxable Amount (AED) Tax Amount (AED)
Standard Rate (5%) 2,285.72 114.28
Total AED2,285.72 AED114.28`;

/** Real OCR output from RAK Bank Tax Invoice (PHOTO JPG, 75% confidence) */
export const REAL_RAK_BANK_INVOICE_OCR = `J AK BANK     tape os     RAKIslamic
RAKBANK                          Tax Invoice                                       |            21
I                                        Me de Cis
.                  3112/7202                                     .
TRANSIT HUB SHIPPING LLC                                             Date:                  12/2023
101
0112/2025 - 5                                +
Hawai Building                                                                                  Period:
Al Nabaa
Invoice No:               INV20251200095426
SHARJAH, United Arab Emirates
Tax Registration
.                                                                                                                     PRT
Your Transactions
Date of             Account/                    Transaction Narration                  Transaction           FX Rate           Transaction              VAT             Total (AED)
Supply         Agreement No.                                                                    Amount                                  Amount (AED)       Amount @
5% (AED)
14-12 5      XX709353                  Overdue Chg                              AED 420.00         10000              400.00            20.00              420.00
03 12 2025     XXXXXXX199998         8373483199901                         AED 103.95        10000               99 00              4.95               103.95
Total               499.00              24 95                 52395`;

/** Real OCR output from Arabic tax invoice (IMG_2560 - Ania Al Zahabia, 44% confidence) */
export const REAL_ARABIC_INVOICE_OCR = `Ania Al Zahabia
For Home Propretiecs
0538101119 300634562700003
2025-10-01
40.00 34.78 5.22`;

/** OCR text with common garbling patterns for normalization testing */
export const GARBLED_OCR_TEXT = `
Gl0bal Tech S0lutions lnc
4S7 lndustrial Blvd
Lon don, UK EC1A 1BB

lNVOlCE #: GT-2024-108
Date: 2024-03-22

T0TAL:                                  6,6OO.OO
Sub total:                              5,5OO.OO
Tax (20%):                              1,1OO.OO
Consult ing Services       20   200.OO    4,OOO.OO
Softw are License           1   l,500.00  l,500.00
`;

// ─── Real OCR Captures (HEIC/JPG images, various confidence levels) ────

/** IMG_2561 — Iwan Al Andalusian apartments hotel invoice (78% confidence) */
export const REAL_IWAN_ANDALUSIA_OCR = `شركة ايوان الاندلسية للشقق المخدومة
لافنت بارك
النسيم Jeddah
VAT No: 310398794900003
C.R.: 4030309093
فاتورة ضريبية
Invoice No.: 005678
Invoice date: 06/10/2025
إيجار الوحدة 04/10/2025-05/10/2025  QTY: 2  Price: 159.88  Amount: 319.75
رسم إيجار  QTY: 1  Price: 7.99  Amount: 7.99
Total subject to VAT: 327.74
VAT (15%): 49.16
Grand Total (Included VAT 15%): 376.9 SR`;

/** IMG_2562 — Nakhat Al-Wafa Kitchen catering invoice (81% confidence) */
export const REAL_NAKHAT_WAFA_OCR = `شركة مطبخ نكهة الوفاء لتقديم الوجبات
المدينة المنورة شارع خالد بن الوليد حي البركة
VAT No: 311212072700003
0568173502
فاتورة ضريبية مبسطة
Invoice No.: EB-95016
Date: 16/10/2025 11:07:38 AM
شركة سوار الذهبية
ذبيحة كاملة  QTY: 1  Unit Price: 1,400.00
Total Taxable Amount: 1,217.39
Discount: 0.00
Total VAT (15%): 182.61
Total Amount Due: 1,400.00 ريال`;

/** IMG_2563 — Tasali Al-Khair faded trading receipt (54% confidence) */
export const REAL_TASALI_ALKHAIR_OCR = `شركة تسالي الخير للتجارة
فاتورة ضريبية مبسطة
رقم الفاتورة: 927
الرقم الضريبي: 31125530500003
اسم البائع: امجاد الجهني
لوز شمس مالح  الكمية: 0.505  السعر: 28.00  المجموع: 14.14
المجموع قبل الضريبة: 12.30
ضريبة القيمة المضافة 15%: 1.84
الإجمالي المستحق: 14.14
طريقة الدفع: شبكة`;

/** IMG_2564 — Masarat Al-Nahda poultry supplier invoice (70% confidence) */
export const REAL_MASARAT_NAHDA_OCR = `شركة مسارات النهضة للتجارة
791 شارع خالد بن قيس السهمي حي الوبرة
الرقم الضريبي: 310178577300003
فاتورة ضريبية
رقم الفاتورة: 57827
التاريخ: 01-10-2025
اسم العميل: شركة سوار الذهبية للدعاية والاعلان
دجاج الفروج الذهبي مبرد 800 جرام  Qty: 15.00  Price: 183.75  VAT: 23.97  Total: 187.01
Total Before Tax: 163.04
Discount: 3.26
VAT 15%: 23.97
Total Amount: 183.75`;

/** IMG_2565 — Barda Food Products receipt (77% confidence) */
export const REAL_BARDA_FOOD_OCR = `مؤسسة باردا للمنتجات الغذائية
فرع البدراني
فاتورة ضريبية مبسطة
S20251018-9014
Date: 18/10/2025 10:57:16 PM
VAT No: 312232234700003
Oska 330ml  Qty: 5  Price: 11.30  Total: 65.00
الإجمالي الفرعي: 56.52
ضريبة القيمة المضافة (15%): 8.48
الإجمالي (شامل الضريبة): 65 ريال`;

/** IMG_2567 — Panda supermarket receipt (68% confidence) */
export const REAL_PANDA_SUPERMARKET_OCR = `Panda بنده
فاتورة ضريبية مبسطة
VAT No: 300055521610003
KINZA COLA 250ML    1.50
KINZA BC 250ML      1.50
KINZA LM 250ML      1.50
ALMARAI TRAT 100G   3.50
ALMARAI L FF 2L    11.00
MINT                1.50
Total Items: 32
Total: 125.62
VAT (15%): 16.39`;

/** IMG_2569 — Al-Hulul grocery store (63% confidence) */
export const REAL_HULUL_GROCERY_OCR = `شركة الحلول الاستهلاكية للمواد الغذائية
VAT No: 311754614800003
فاتورة ضريبية مبسطة
Date: 27/10/2025
Victory Biscuit  2x  11.50
Bonny Milk  2x  11.50
Full Fat Milk  3x  17.25
Subtotal: 270.00
VAT (15%): 40.50
Net Total: 310.50`;

/** IMG_2570 — Al-Marwani spice retailer (50% confidence) */
export const REAL_MARWANI_SPICES_OCR = `المرواني
مؤسسة عبدالكريم محمد المرواني التجارية فرع الحلقة
الرقم الضريبي: 300586962400003
فاتورة ضريبية مبسطة
Date: 01/10/2025
شركة سوار الذهبية للدعاية والاعلان
كيلو ليمون ناعم  Weight: 145  Price: 34.50  Total: 5.00
كيلو كزبرة ناشف  Weight: 265  Price: 11.50  Total: 3.05
كيلو فلفل اسود ناعم  Weight: 11  Price: 46.00  Total: 5.06
كيلو فلفل باربيكا ناعم بارد  Weight: 125  Price: 28.75  Total: 3.59
الاجمالي قبل الضريبة: 14.53
ضريبة القيمة المضافة 15%: 2.18
الاجمالي النهائي: 16.71`;

/** IMG_2571 — Memaz restaurant (60% confidence) */
export const REAL_MEMAZ_RESTAURANT_OCR = `ميمـاز
Memaz - Branch 1
VAT No: 311810911900003
فاتورة ضريبية مبسطة
Order #: 46
Date: 2025/10/16 03:07:45 PM
Invoice #: 203173
MEMAZ KIBBEH     2    72.00
GRAPE LEAVES     1    19.00
EGGPLANT FATAH   1    33.00
PASTA BALLS      1    36.00
CHERRY KABAB     1    59.00
PENNEGARTIN PASTA 1   49.00
CHICKEN CORDON BLUE 2 114.00
TRUFFLE PASTA    1    57.00
PIZZA MARGRITA   1    42.00
TOUBALA SALAD    1    18.00
PEPSI            5    30.00
Subtotal: 460.00
VAT (15%): 69.00
Total: 529.00
Payment: VISA`;

/** IMG_2573 — Rahiyyah store (83% confidence) */
export const REAL_RAHIYYAH_STORE_OCR = `مؤسسة رحيه الخضراء
فاتورة بيع
Invoice No: 1034
Date: 2025/10/21
خلاط دش عادي ايوا  Qty: 1  Price: 70.00
Total: 70.00`;

/** IMG_2574 — Kaki Bakeries (81% confidence) */
export const REAL_KAKI_BAKERIES_OCR = `كعكي
Hamza Badi Kaki Bakeries
Madinah Bani Dhafir
VAT No: 300520804200003
Date: 11/10/2025
شابورة زيت زيتون 1 kg: 16.00
شابورة زبدة 1 kg: 16.00
Total Before Tax: 27.83
VAT (15%): 4.17
Total: 32.00`;

/** IMG_2575 — Crystal restaurant (73% confidence) */
export const REAL_CRYSTAL_RESTAURANT_OCR = `Crystal - Al-Faysaliah Branch
بيوت الكاكاو
VAT No: 300163557200003
0126104430
Order #: 3
Date: 2025/10/06 07:11:49 PM
Invoice No: 109232
Caramel 2001 Kilo  QTY: 0.3  Price: 63.92  Total: 63.92
Subtotal: 63.92
VAT (15%): 9.59
Total: 73.50
Payment: MADA`;

/** IMG_2576 — Masoub Al Sultan food (55% confidence) */
export const REAL_MASOUB_SULTAN_OCR = `معصوب السلطان - فرع الرحاب
Jeddah Prince Miteb bin Abdulaziz St.
VAT No: 311611817700003
Date: 10-04-2025
معصوب قشطة حليب: 19.13
مطبق حلو: 0
Total Before Tax: 19.13
VAT: 2.87
Net Total: 22.0`;

/** IMG_2577 — RATIO Speciality Coffee (65% confidence) */
export const REAL_RATIO_COFFEE_OCR = `ريشيـو
RATIO Speciality Coffee
Branch: YNB.05
VAT No: 31084939400003
Date: 2025/10/04
Today's Coffee Medium: 2.00
Iced Today's Coffee Medium: 2.00
Triple chocolate cake: 27.00
Subtotal: 38.24
VAT (15%): 5.74
Total: 43.98`;

/** IMG_2578 — Grand Hyper grocery (66% confidence) */
export const REAL_GRAND_HYPER_OCR = `شركة جراند هايبر للتجارة
VAT No: 311852086500003
Date: 2025/10/01
Potatoes Local: 10.00
Chocolate Cake: 5.75
Maamoul Dates: 6.95
Basmati Rice 5kg: 34.00
Tahina Liquid: 14.50
Black Pepper Sauce: 3.00
Ketchup: 3.00
Net Total: 206.15
VAT included`;

/** IMG_2579 — Aswaq Ghand market (46% confidence) */
export const REAL_ASWAQ_GHAND_OCR = `اسواق غند الفردي
VAT No: 300507563400003
Date: 2025-10-02
بريسكان: 1.74
مياه: 8.70
كيك: 13.05
مراعي زبدة: 4.35
Total without Tax: 45.41
VAT (15%): 6.81
Grand Total: 52.22`;

/** IMG_2580 — Petroquel gas station (95% confidence) */
export const REAL_PETROQUEL_GAS_OCR = `شركة محطة بتروقل
VAT No: 310716730900003
C.R.: 4650272479
Invoice No: 81781
Date: 01.10.25 17:48
بنزين 95  Volume: 42.92 L  Price: 2.33  Total: 100.00
Total Amount (Pre-tax): 86.96
VAT (15%): 13.04
Grand Total: 100.00`;

/** IMG_2581 — Aldrees gas station with 19-digit invoice (95% confidence) */
export const REAL_ALDREES_GAS_OCR = `شركة الدريس للخدمات البترولية والنقليات
المركز الرئيسي الرياض النسيم الشرقي
VAT No: 300056462300003
فاتورة ضريبية مبسطة
Invoice No: 0091301202501321678
Date: 04.10.2025 12:22:33
بنزين 95  Volume: 37.33 Liters  Unit Price: 2.33 ريال  Total: 87.00
Total Amount (Gross): 87.00 ريال
VAT Base (Net): 75.65
VAT (15%): 11.35
Grand Total: 87.00`;

/** IMG_2582 — Layaly Restaurants (95% confidence) */
export const REAL_LAYALY_RESTAURANTS_OCR = `شركة مطاعم ليالي المحدودة
جدة حي الصفا شارع أم القرى
VAT No: 310419123100003
0126780270
فاتورة ضريبية مبسطة
Order No: 250020120498
Date: 04/10/2025 04:57 PM
DineIn
ربع ذبيحة مندي  Qty: 1  Price: 356  Total: 356
لبن القرية  Qty: 2  Price: 3  Total: 6
بيبسي  Qty: 1  Price: 4  Total: 4
ماء نوفا  Qty: 1  Price: 1  Total: 1
كريمة  Qty: 1  Price: 10  Total: 10
Total before VAT: 329.57
VAT (15%): 49.43
Grand Total: 379.00`;

/** IMG_2584 — Masoub Al Sultan faded receipt (44% confidence) */
export const REAL_MASOUB_SULTAN_FADED_OCR = `معصوب السلطان - فرع الرحاب
VAT No: 311611817700003
Invoice No: 193
Date: 2025-10-05 10:41
معصوب: 18.26
مطبق: 2.74
Total: 21.0`;

/** IMG_2585 — Aswaq Ghanem market (48% confidence) */
export const REAL_ASWAQ_GHANEM_OCR = `اسواق غانم الفريدي
VAT No: 300507663400003
المدينة المنورة طريق مكة المكرمة
فاتورة ضريبية مبسطة
Invoice No: 639818/1
Date: 2025-10-04 12:15:46
ماء  Qty: 3  Unit Price: 0.87  Total: 2.61
Total w/o VAT: 2.61
VAT (15%): 0.39
Grand Total: 3.00`;

/** IMG_2586 — SASCO gas station (47% confidence) */
export const REAL_SASCO_GAS_OCR = `SASCO
شركة ساسكو للخدمات البترولية
المدينة 433010
VAT No: 300055275110003
فاتورة ضريبية مبسطة
Invoice ID: 1224427
Date: 2025-10-07 00:31:12
Petrol 95  Volume: 54.52 Liters  Price: 2.33  Total: 127.03
Net Amount: 110.46
VAT (15%): 16.57
Grand Total: 127.03 SAR`;

/** IMG_2587 — Al Naeem gas station (56% confidence) */
export const REAL_NAEEM_GAS_OCR = `1304 Al Naeem
محطة النعيم
Jeddah Al Naeem Dist.
VAT No: 300047126100003
فاتورة ضريبية مبسطة
Txn ID: 456382
Date: 2025-10-05 21:42:35
Gasoline 95  Volume: 54.09 Liters  Price: 2.33  Total: 126.03
Taxable Amount: 109.59
VAT (15%): 16.44
Grand Total: 126.03 SAR`;

/** IMG_2588 — RAWNAH coffee shop (46% confidence) */
export const REAL_RAWNAH_COFFEE_OCR = `رونة
R A W N A H
مؤسسة عالم رونة التجارية
VAT No: 314233133600003
فاتورة ضريبية مبسطة
Invoice No: 292690
Date: 2025/10/05 12:34:42
قهوة اليوم صغير حار  Price: 11.00
المجموع الفرعي: 9.57
VAT (15%): 1.43
الاجمالي: 11.00`;

/** IMG_2590 — Chef's Burger (63% confidence) */
export const REAL_CHEFS_BURGER_OCR = `Chef's
HOMEMADE BURGER GOURMET
فرع ليوان جدة
طريق الملك عبد الله الفرعي
VAT No: 312081015700003
Simplified Tax Invoice
Order #: 85
Check #: 576547
Date: 2025/10/05 07:03:11 PM
Dine In
Basic Box  Qty: 1  Price: 60.00
Water 330ml  Qty: 2  Price: 2.00
Pepsi Diet  Qty: 2  Price: 10.00
Brisket Fries  Qty: 1  Price: 30.00
Subtotal: 88.70
ضريبة القيمة المضافة (15%): 13.30
Total: 102.00`;

/** IMG_2591 — ARCHI coffee shop (63% confidence) */
export const REAL_ARCHI_COFFEE_OCR = `ARCHI
Archi AJ02 Alanduls
VAT No: 311626816300003
CR: 2051231076
Simplified Tax Invoice
Order #: 64
Check #: 181285
Date: 2025/10/05 02:17:42 PM
Dine In
Iced Coffee of the day Large: 14.00
Choco Pudding: 35.00
Flat white Full Fat Milk: 18.00
Subtotal: 58.26
VAT (15.0%): 8.74
Total: 67.00`;

/** IMG_2594 — Baskin Robbins (41% confidence) */
export const REAL_BASKIN_ROBBINS_OCR = `baskin robbins
باسكن روبنز
شركة جميرة التجارية المحدودة
Madinah Bidahr
VAT No: 300523219900003
CR: 4030145236
فاتورة ضريبية مبسطة
Bill No: 32404936
Date: 2025-10-05 1:22:59
Value Brownie Ala m  Qty: 1  Price: 29.56
Sub Total: 29.56
Tax (SAR): 4.44
Total Amt Inclusive of Tax: 34.00`;

/** IMG_2596 — ALMOTAMAYIZIN electrical (90% confidence) */
export const REAL_ALMOTAMAYIZIN_OCR = `مؤسسة المتميزين للكهرباء
ALMOTAMAYIZIN Est
المدينة المنورة مركز المدينة التجاري
0555455823
VAT No: 311697749500003
CR: 4650259532
رقم الفاتورة: 4138
التاريخ: 15/10/2025
نقدي
شركة سوار
كشاف 60 واط شمسي مجرى  Code: 12414  Qty: 6  Unit Price: 43.48  Total: 260.88
Total Excl. VAT: 260.88
Discount: 0.00
Total Taxable: 260.88
VAT 15%: 39.13
صافي الفاتورة: 300.01
فقط ثلاثمائة ريال سعودي و هللة لاغير`;

/** Real OCR output from RAK Bank Tax Invoice V2 (live scan, split header with Arabic translations) */
export const REAL_RAK_BANK_INVOICE_OCR_V2 = `TRANSIT HUB SHIPPING LLC

101

RAKBANK

Hawai Building

Al Nabad 1

SHARJAH. United Arab Emiates

Your Transactions
Date of          Account/                 Transaction Narration
Supply       Agreement No.

14.12 2025     XX709353              Overdue Chy

0312 2025

XXXXXXX199998

8373483199901

Tax Invoice

Date:
Period:
Invoice No:
Tax Registration No:
Transaction            FX Rate
Amount

pink
fused)
AED 420 00         1.0000
AED 103.95           10000

Total

311122025
0112/2025 - 3112/2025
INV20251200095426
104303905400003
Transaction              VAT              Total {AED)
Amount (AED)      Amount @
5% (AED)
40000         2000          42000
9900              4.95               103.95
499 00             24 95               52395`;
