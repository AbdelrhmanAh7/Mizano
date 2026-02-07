import { DriveStep } from 'driver.js';

interface TourDefinition {
  steps: DriveStep[];
}

export const tourDefinitions: Record<string, Record<string, TourDefinition>> = {
  sales_invoices: {
    en: {
      steps: [
        {
          element: '[data-tour="create-invoice-btn"]',
          popover: {
            title: 'Create Your First Invoice',
            description:
              'Click here to create a new invoice for your customers. Fill in customer details, line items, and payment terms.',
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '[data-tour="invoice-filters"]',
          popover: {
            title: 'Filter & Search',
            description:
              'Use these filters to find invoices by status, customer, date range, or amount. You can save custom views for quick access.',
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '[data-tour="invoice-list"]',
          popover: {
            title: 'Invoice List',
            description:
              'All your invoices are displayed here. Click any invoice to view details, send reminders, or record payments.',
            side: 'top',
            align: 'start',
          },
        },
        {
          element: '[data-tour="invoice-actions"]',
          popover: {
            title: 'Quick Actions',
            description:
              'Use the action buttons to send invoices, generate reports, export data, or duplicate invoices.',
            side: 'left',
            align: 'center',
          },
        },
      ],
    },
    ar: {
      steps: [
        {
          element: '[data-tour="create-invoice-btn"]',
          popover: {
            title: 'إنشاء أول فاتورة',
            description:
              'انقر هنا لإنشاء فاتورة جديدة للعملاء. أدخل بيانات العميل والبنود والشروط.',
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '[data-tour="invoice-filters"]',
          popover: {
            title: 'البحث والتصفية',
            description:
              'استخدم هذه الفلاتر للبحث عن الفواتير حسب الحالة والعميل والتاريخ. يمكنك حفظ طرق عرض مخصصة.',
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '[data-tour="invoice-list"]',
          popover: {
            title: 'قائمة الفواتير',
            description:
              'تظهر جميع فواتيرك هنا. انقر على أي فاتورة لعرض التفاصيل أو إرسال التنبيهات أو تسجيل الدفع.',
            side: 'top',
            align: 'start',
          },
        },
        {
          element: '[data-tour="invoice-actions"]',
          popover: {
            title: 'الإجراءات السريعة',
            description:
              'استخدم أزرار الإجراءات لإرسال الفواتير أو إنشاء التقارير أو تصدير البيانات أو تكرار الفاتورة.',
            side: 'left',
            align: 'center',
          },
        },
      ],
    },
  },

  sales_customers: {
    en: {
      steps: [
        {
          element: '[data-tour="create-customer-btn"]',
          popover: {
            title: 'Add a New Customer',
            description:
              'Click here to create a new customer profile. Add contact information, billing address, and credit terms.',
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '[data-tour="customer-list"]',
          popover: {
            title: 'Customer Directory',
            description:
              'View all your customers here. Search by name, email, or phone. Click on a customer to view their history and invoices.',
            side: 'top',
            align: 'start',
          },
        },
      ],
    },
    ar: {
      steps: [
        {
          element: '[data-tour="create-customer-btn"]',
          popover: {
            title: 'إضافة عميل جديد',
            description:
              'انقر هنا لإنشاء ملف تعريف العميل. أضف معلومات الاتصال والعنوان وشروط الائتمان.',
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '[data-tour="customer-list"]',
          popover: {
            title: 'دليل العملاء',
            description:
              'عرض جميع عملائك هنا. ابحث حسب الاسم أو البريد الإلكتروني أو الهاتف. انقر على عميل لعرض سجله وفواتيره.',
            side: 'top',
            align: 'start',
          },
        },
      ],
    },
  },

  inventory_items: {
    en: {
      steps: [
        {
          element: '[data-tour="create-item-btn"]',
          popover: {
            title: 'Add New Item',
            description:
              'Click here to add a new product or service to your inventory. Set pricing, SKU, and reorder levels.',
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '[data-tour="item-list"]',
          popover: {
            title: 'Item Inventory',
            description:
              'View all items in stock. Monitor quantity levels, pricing, and availability across warehouses.',
            side: 'top',
            align: 'start',
          },
        },
      ],
    },
    ar: {
      steps: [
        {
          element: '[data-tour="create-item-btn"]',
          popover: {
            title: 'إضافة عنصر جديد',
            description:
              'انقر هنا لإضافة منتج أو خدمة جديدة للمخزون. حدد السعر والرمز ومستويات إعادة الطلب.',
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '[data-tour="item-list"]',
          popover: {
            title: 'مخزون العناصر',
            description:
              'عرض جميع العناصر المخزنة. راقب مستويات الكمية والتسعير والتوفر عبر المستودعات.',
            side: 'top',
            align: 'start',
          },
        },
      ],
    },
  },

  accounting_journals: {
    en: {
      steps: [
        {
          element: '[data-tour="create-journal-btn"]',
          popover: {
            title: 'Create Journal Entry',
            description:
              'Click here to record manual journal entries. Ensure debits equal credits for balanced entries.',
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '[data-tour="chart-of-accounts"]',
          popover: {
            title: 'Chart of Accounts',
            description:
              'Your chart of accounts is displayed here. Link transaction lines to the appropriate accounts.',
            side: 'top',
            align: 'start',
          },
        },
      ],
    },
    ar: {
      steps: [
        {
          element: '[data-tour="create-journal-btn"]',
          popover: {
            title: 'إنشاء قيد يومي',
            description:
              'انقر هنا لتسجيل قيود يومية يدوية. تأكد من أن المدينة تساوي الدائنة للقيود المتوازنة.',
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '[data-tour="chart-of-accounts"]',
          popover: {
            title: 'دليل الحسابات',
            description:
              'يظهر دليل الحسابات الخاص بك هنا. ربط بنود المعاملات بالحسابات المناسبة.',
            side: 'top',
            align: 'start',
          },
        },
      ],
    },
  },
};
