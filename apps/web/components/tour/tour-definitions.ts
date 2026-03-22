import { DriveStep } from 'driver.js';

interface TourDefinition {
  steps: DriveStep[];
}

export const tourDefinitions: Record<string, Record<string, TourDefinition>> = {
  // Dashboard welcome tour — shown on first login
  dashboard: {
    en: {
      steps: [
        {
          element: '[data-tour="dashboard-stats"]',
          popover: {
            title: 'Your Financial Overview',
            description:
              'These cards show your key metrics at a glance — revenue, expenses, net profit, and bank balance.',
            side: 'bottom',
            align: 'center',
          },
        },
        {
          element: '[data-tour="dashboard-charts"]',
          popover: {
            title: 'Visual Insights',
            description:
              'Interactive charts help you spot trends in cash flow and revenue over time.',
            side: 'top',
            align: 'center',
          },
        },
        {
          element: '[data-tour="dashboard-ai-alerts"]',
          popover: {
            title: 'AI-Powered Alerts',
            description:
              "Mizano's AI watches your data and surfaces important insights — anomalies, suggestions, and reminders.",
            side: 'top',
            align: 'start',
          },
        },
        {
          element: '[data-tour="dashboard-transactions"]',
          popover: {
            title: 'Recent Transactions',
            description:
              'Quickly review recent activity across all your accounts. Click any transaction for details.',
            side: 'top',
            align: 'start',
          },
        },
      ],
    },
    ar: {
      steps: [
        {
          element: '[data-tour="dashboard-stats"]',
          popover: {
            title: 'نظرة عامة مالية',
            description:
              'تعرض هذه البطاقات مقاييسك الرئيسية — الإيرادات والمصروفات وصافي الربح ورصيد البنك.',
            side: 'bottom',
            align: 'center',
          },
        },
        {
          element: '[data-tour="dashboard-charts"]',
          popover: {
            title: 'رؤى بصرية',
            description:
              'تساعدك الرسوم البيانية التفاعلية على رصد اتجاهات التدفق النقدي والإيرادات بمرور الوقت.',
            side: 'top',
            align: 'center',
          },
        },
        {
          element: '[data-tour="dashboard-ai-alerts"]',
          popover: {
            title: 'تنبيهات الذكاء الاصطناعي',
            description:
              'يراقب الذكاء الاصطناعي في ميزانو بياناتك ويظهر رؤى مهمة — حالات شاذة واقتراحات وتذكيرات.',
            side: 'top',
            align: 'start',
          },
        },
        {
          element: '[data-tour="dashboard-transactions"]',
          popover: {
            title: 'المعاملات الأخيرة',
            description:
              'راجع النشاط الأخير بسرعة عبر جميع حساباتك. انقر على أي معاملة لعرض التفاصيل.',
            side: 'top',
            align: 'start',
          },
        },
      ],
    },
  },

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
              'Use these filters to find invoices by status, customer, date range, or amount.',
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '[data-tour="invoice-list"]',
          popover: {
            title: 'Invoice List',
            description:
              'All your invoices are displayed here. Click any invoice to view details. Use the "..." menu on each row for quick actions like send, edit, or void.',
            side: 'top',
            align: 'start',
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
            description: 'استخدم هذه الفلاتر للبحث عن الفواتير حسب الحالة والعميل والتاريخ.',
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '[data-tour="invoice-list"]',
          popover: {
            title: 'قائمة الفواتير',
            description:
              'تظهر جميع فواتيرك هنا. انقر على أي فاتورة لعرض التفاصيل. استخدم قائمة "..." في كل صف للإجراءات السريعة مثل الإرسال والتعديل والإلغاء.',
            side: 'top',
            align: 'start',
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
          element: '[data-tour="journal-list"]',
          popover: {
            title: 'Journal Entries',
            description:
              'All your journal entries are listed here. You can view, edit, post, or delete draft entries.',
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
          element: '[data-tour="journal-list"]',
          popover: {
            title: 'القيود اليومية',
            description:
              'تظهر جميع قيودك اليومية هنا. يمكنك عرض أو تعديل أو ترحيل أو حذف القيود المسودة.',
            side: 'top',
            align: 'start',
          },
        },
      ],
    },
  },
};
