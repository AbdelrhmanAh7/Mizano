/**
 * The one server-side catalog of error messages (owner rule, "two languages everywhere").
 *
 * Services keep throwing English (`new NotFoundException('Invoice not found')`); the exception
 * filter maps that exact English text, or the code the throw carries, to an entry here and
 * answers with the entry's `code` and the message in the request language.
 *
 * - `en` is the exact English text the code throws. `{name}` marks a parameter: the entry then
 *   matches any message of that shape and the captured values are put into `ar`.
 * - `aliases` are other English texts that mean the same thing (framework defaults).
 * - A new literal message thrown anywhere in `src` must be added here: the completeness spec
 *   (`error-catalog.spec.ts`) scans the source tree and fails otherwise.
 * - Arabic is plain Modern Standard Arabic for accountants and business owners in Egypt, Saudi
 *   Arabia and the UAE: no technical words such as API, HTTP, JSON, token, payload or webhook.
 */
export interface ErrorCatalogEntry {
  /** Stable code sent on the wire. */
  code: string;
  /** Exact English text; `{name}` marks a parameter. */
  en: string;
  /** Arabic text; may use the same `{name}` parameters. */
  ar: string;
  /** Other English texts that resolve to this entry. */
  aliases?: string[];
}

/** A per-field validation message (class-validator defaults and the repo's custom rules). */
export interface FieldMessageEntry {
  /** English shape; `{property}` is the field path, other `{name}`s are constraint values. */
  en: string;
  ar: string;
}

/** Generic messages per status, used when a thrown message has no entry of its own. */
export const GENERIC_ERRORS: ErrorCatalogEntry[] = [
  {
    code: 'BAD_REQUEST',
    en: 'The request is not valid',
    ar: 'الطلب غير صالح. راجِع البيانات المدخلة وحاول مرة أخرى.',
    aliases: ['Bad Request'],
  },
  {
    code: 'UNAUTHORIZED',
    en: 'Sign in to continue',
    ar: 'سجّل الدخول للمتابعة.',
    aliases: ['Unauthorized'],
  },
  {
    code: 'FORBIDDEN',
    en: 'You do not have permission to do this',
    ar: 'ليست لديك صلاحية للقيام بهذا الإجراء.',
    aliases: ['Forbidden', 'Forbidden resource'],
  },
  {
    code: 'NOT_FOUND',
    en: 'The requested item was not found',
    ar: 'العنصر المطلوب غير موجود.',
    aliases: ['Not Found'],
  },
  {
    code: 'CONFLICT',
    en: 'This record was changed or already exists. Refresh and try again.',
    ar: 'تم تعديل هذا السجل أو أنه موجود مسبقًا. حدّث الصفحة وحاول مرة أخرى.',
    aliases: ['Conflict'],
  },
  {
    code: 'PAYLOAD_TOO_LARGE',
    en: 'The file or data sent is too large',
    ar: 'الملف أو البيانات المرسلة أكبر من الحد المسموح به.',
    aliases: ['Payload Too Large', 'File too large', 'request entity too large'],
  },
  {
    code: 'UNPROCESSABLE_ENTITY',
    en: 'This action is not allowed in the current state',
    ar: 'لا يمكن تنفيذ هذا الإجراء في الحالة الحالية.',
    aliases: ['Unprocessable Entity'],
  },
  {
    code: 'TOO_MANY_REQUESTS',
    en: 'Too many attempts. Wait a moment and try again.',
    ar: 'محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.',
    aliases: ['Too Many Requests', 'ThrottlerException: Too Many Requests'],
  },
  {
    code: 'LOGIN_ACCOUNT_LOCKED',
    en: 'Too many failed sign-ins for this account. Try again in 15 minutes.',
    ar: 'محاولات دخول فاشلة كثيرة لهذا الحساب. حاول مرة أخرى بعد 15 دقيقة.',
  },

  {
    code: 'INTERNAL_ERROR',
    en: 'An unexpected error occurred',
    ar: 'حدث خطأ غير متوقع. حاول مرة أخرى لاحقًا.',
    aliases: ['Internal Server Error'],
  },
  {
    code: 'SERVICE_UNAVAILABLE',
    en: 'The service is temporarily unavailable. Try again shortly.',
    ar: 'الخدمة غير متاحة مؤقتًا. حاول مرة أخرى بعد قليل.',
    aliases: ['Service Unavailable'],
  },
];

/** Framework, validation and database messages produced by the filter itself. */
const FRAMEWORK_ERRORS: ErrorCatalogEntry[] = [
  {
    code: 'VALIDATION_ERROR',
    en: 'Validation Failed',
    ar: 'بعض البيانات المدخلة غير صحيحة. راجِع الحقول المحددة.',
    aliases: ['Validation failed', 'Validation error'],
  },
  {
    code: 'ROUTE_NOT_FOUND',
    en: 'Cannot {method} /{path}',
    ar: 'الصفحة أو الخدمة المطلوبة غير موجودة.',
  },
  {
    code: 'UNIQUE_CONSTRAINT_VIOLATION',
    en: 'A record with this {field} already exists',
    ar: 'يوجد سجل آخر بالقيمة نفسها في {field}.',
  },
  {
    code: 'FOREIGN_KEY_VIOLATION',
    en: 'Invalid reference: {field}',
    ar: 'القيمة المرتبطة غير صالحة: {field}',
  },
  {
    code: 'RECORD_NOT_FOUND',
    en: 'The requested record was not found',
    ar: 'السجل المطلوب غير موجود.',
  },
  {
    code: 'REQUIRED_RELATION_VIOLATION',
    en: 'A required relation is missing',
    ar: 'بيانات مرتبطة مطلوبة غير موجودة.',
  },
  {
    code: 'DATABASE_ERROR',
    en: 'A database error occurred',
    ar: 'حدث خطأ أثناء حفظ البيانات أو قراءتها. حاول مرة أخرى.',
  },
];

/** Sign-in, sessions, passwords, users and roles. */
const AUTH_ERRORS: ErrorCatalogEntry[] = [
  {
    code: 'INVALID_TOKEN',
    en: 'Invalid or expired token',
    ar: 'انتهت الجلسة أو أنها غير صالحة. سجّل الدخول مرة أخرى.',
  },
  {
    code: 'INVALID_REFRESH_TOKEN',
    en: 'Invalid refresh token',
    ar: 'انتهت جلستك. سجّل الدخول مرة أخرى.',
  },
  {
    code: 'INVALID_CREDENTIALS',
    en: 'Invalid email or password',
    ar: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  },
  { code: 'ACCOUNT_INACTIVE', en: 'Account is not active', ar: 'حساب المستخدم غير مفعّل.' },
  {
    code: 'USER_INACTIVE',
    en: 'User not found or inactive',
    ar: 'المستخدم غير موجود أو غير مفعّل.',
  },
  {
    code: 'EMAIL_ALREADY_REGISTERED',
    en: 'Email already registered',
    ar: 'البريد الإلكتروني مسجّل مسبقًا.',
  },
  { code: 'EMAIL_EXISTS', en: 'Email already exists', ar: 'البريد الإلكتروني مستخدم مسبقًا.' },
  {
    code: 'EMAIL_EXISTS_IN_ORGANIZATION',
    en: 'Email already exists in this organization',
    ar: 'البريد الإلكتروني مستخدم مسبقًا في هذه المنشأة.',
  },
  {
    code: 'PASSWORD_RESET_INVALID',
    en: 'This reset link is invalid or has expired. Request a new one.',
    ar: 'رابط إعادة تعيين كلمة المرور غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.',
  },
  {
    code: 'PASSWORD_RESET_LINK_ADMIN_ONLY',
    en: 'Only an organization admin can create a password reset link',
    ar: 'إنشاء رابط إعادة تعيين كلمة المرور متاح لمدير المنشأة فقط.',
  },
  {
    code: 'PASSWORD_RESET_MEMBER_INACTIVE',
    en: 'Only an active member can get a password reset link',
    ar: 'لا يمكن إنشاء رابط لإعادة تعيين كلمة المرور إلا لعضو نشط.',
  },
  {
    code: 'PASSWORD_RESET_SENT',
    en: 'If an account exists for this email, we sent a link to reset the password.',
    ar: 'إذا كان هناك حساب بهذا البريد الإلكتروني، فقد أرسلنا إليه رابطًا لإعادة تعيين كلمة المرور.',
  },
  {
    code: 'PASSWORD_CHANGED',
    en: 'Your password was changed. Sign in with the new password.',
    ar: 'تم تغيير كلمة المرور. سجّل الدخول بكلمة المرور الجديدة.',
  },
  {
    code: 'SIGNED_OUT_ALL_DEVICES',
    en: 'Signed out on all devices',
    ar: 'تم تسجيل الخروج من جميع الأجهزة.',
  },
  {
    code: 'PASSWORD_UPPERCASE_REQUIRED',
    en: 'Password must contain at least one uppercase letter',
    ar: 'يجب أن تحتوي كلمة المرور على حرف إنجليزي كبير واحد على الأقل.',
  },
  {
    code: 'PASSWORD_LOWERCASE_REQUIRED',
    en: 'Password must contain at least one lowercase letter',
    ar: 'يجب أن تحتوي كلمة المرور على حرف إنجليزي صغير واحد على الأقل.',
  },
  {
    code: 'PASSWORD_NUMBER_REQUIRED',
    en: 'Password must contain at least one number',
    ar: 'يجب أن تحتوي كلمة المرور على رقم واحد على الأقل.',
  },
  {
    code: 'PASSWORD_TOO_LONG',
    en: 'Password must not exceed 128 characters',
    ar: 'يجب ألا تزيد كلمة المرور على 128 حرفًا.',
  },
  {
    code: 'PASSWORD_TOO_SHORT',
    en: 'Password must be at least 8 characters',
    ar: 'يجب ألا تقل كلمة المرور عن 8 أحرف.',
    aliases: ['Password must be at least 8 characters long'],
  },
  { code: 'ACCESS_DENIED', en: 'Access denied', ar: 'تم رفض الوصول.' },
  {
    code: 'USER_ORGANIZATION_NOT_FOUND',
    en: 'User organization not found',
    ar: 'لم يتم العثور على منشأة هذا المستخدم.',
  },
  {
    code: 'ORGANIZATION_ACCESS_DENIED',
    en: 'You do not have access to this organization',
    ar: 'ليست لديك صلاحية الوصول إلى هذه المنشأة.',
  },
  {
    code: 'MISSING_PERMISSION_ANY',
    en: 'Missing permission: one of {permissions}',
    ar: 'ليست لديك الصلاحية المطلوبة. يلزم إحدى الصلاحيات التالية: {permissions}',
  },
  {
    code: 'MISSING_PERMISSION',
    en: 'Missing permission: {permission}',
    ar: 'ليست لديك الصلاحية المطلوبة: {permission}',
  },
  {
    code: 'AUTH_CONTEXT_REQUIRED',
    en: 'Authenticated organization and user are required',
    ar: 'يجب تسجيل الدخول واختيار المنشأة أولًا.',
  },
  {
    code: 'ORGANIZATION_CONTEXT_REQUIRED',
    en: 'Organization context is required',
    ar: 'يجب اختيار المنشأة أولًا.',
  },
  { code: 'ORGANIZATION_NOT_FOUND', en: 'Organization not found', ar: 'المنشأة غير موجودة.' },
  { code: 'USER_NOT_FOUND', en: 'User not found', ar: 'المستخدم غير موجود.' },
  { code: 'ASSIGNEE_NOT_FOUND', en: 'Assigned user not found', ar: 'المستخدم المكلَّف غير موجود.' },
  { code: 'ROLE_NOT_FOUND', en: 'Role not found', ar: 'الدور غير موجود.' },
  { code: 'ROLE_INVALID', en: 'Invalid role', ar: 'الدور غير صالح.' },
  {
    code: 'ROLE_EXISTS',
    en: 'Role "{name}" already exists',
    ar: 'الدور "{name}" موجود مسبقًا.',
  },
  {
    code: 'ADMIN_ROLE_UNDELETABLE',
    en: 'Cannot delete the default Admin role',
    ar: 'لا يمكن حذف دور المدير الافتراضي.',
  },
  {
    code: 'ROLE_HAS_USERS',
    en: 'Cannot delete role with {count} assigned user(s). Reassign users first.',
    ar: 'لا يمكن حذف دور مُسنَد إلى {count} من المستخدمين. انقل المستخدمين إلى دور آخر أولًا.',
  },
];

/** Shared rules: amounts, dates, documents and reference checks. */
const COMMON_ERRORS: ErrorCatalogEntry[] = [
  {
    code: 'DECIMAL_INVALID',
    en: '{field} must be a valid decimal number',
    ar: 'يجب أن تكون قيمة {field} رقمًا عشريًا صحيحًا.',
  },
  {
    code: 'DECIMAL_NEGATIVE',
    en: '{field} must be a non-negative decimal number',
    ar: 'يجب أن تكون قيمة {field} رقمًا عشريًا غير سالب.',
  },
  {
    code: 'NUMBER_NEGATIVE',
    en: '{field} must be a non-negative number',
    ar: 'يجب ألا تكون قيمة {field} سالبة.',
  },
  {
    code: 'DECIMAL_AMOUNT_REQUIRED',
    en: '{field} must be a decimal amount',
    ar: 'يجب أن تكون قيمة {field} مبلغًا عشريًا.',
  },
  {
    code: 'DECIMAL_AMOUNT_INVALID',
    en: '{field} must be a valid decimal amount',
    ar: 'يجب أن تكون قيمة {field} مبلغًا عشريًا صحيحًا.',
  },
  {
    code: 'DECIMAL_AMOUNT_NEGATIVE',
    en: '{field} must be a non-negative decimal amount',
    ar: 'يجب أن تكون قيمة {field} مبلغًا عشريًا غير سالب.',
  },
  {
    code: 'VALUE_NOT_POSITIVE',
    en: '{field} must be greater than zero',
    ar: 'يجب أن تكون قيمة {field} أكبر من صفر.',
  },
  {
    code: 'DECIMAL_SCALE_EXCEEDED',
    en: '{field} must have at most {scale} decimal places',
    ar: 'يجب ألا تزيد المنازل العشرية في {field} على {scale}.',
  },
  {
    code: 'DECIMAL_PRECISION_EXCEEDED',
    en: '{field} must have at most {integerDigits} integer digits and {fractionDigits} decimal places',
    ar: 'يجب ألا تزيد قيمة {field} على {integerDigits} رقمًا صحيحًا و{fractionDigits} منازل عشرية.',
  },
  {
    code: 'NUMBER_TOO_LARGE',
    en: '{field} is too large (at most {digits} digits)',
    ar: 'قيمة {field} كبيرة جدًا (الحد الأقصى {digits} رقمًا).',
  },
  {
    code: 'FIELD_REQUIRED',
    en: '{field} is required',
    ar: 'قيمة {field} مطلوبة.',
  },
  {
    code: 'FIELD_INVALID',
    en: 'Invalid {field}',
    ar: 'قيمة {field} غير صالحة.',
  },
  {
    code: 'DATE_INVALID',
    en: '{field} must be a valid date',
    ar: 'يجب أن تكون قيمة {field} تاريخًا صحيحًا.',
  },
  {
    code: 'DATE_NOT_VALID',
    en: '{field} is not a valid date',
    ar: 'قيمة {field} ليست تاريخًا صحيحًا.',
  },
  {
    code: 'CALENDAR_DATE_INVALID',
    en: '{field} is not a valid calendar date',
    ar: 'قيمة {field} ليست تاريخًا صحيحًا في التقويم.',
  },
  {
    code: 'ISO_DATE_REQUIRED',
    en: '{field} must be an ISO date (YYYY-MM-DD)',
    ar: 'يجب أن تكون قيمة {field} تاريخًا بالصيغة YYYY-MM-DD.',
  },
  {
    code: 'DATE_ORDER_INVALID',
    en: '{start} must be on or before {end}',
    ar: 'يجب ألا يكون {start} بعد {end}.',
  },
  {
    code: 'START_AFTER_END',
    en: 'startDate must not be after endDate',
    ar: 'يجب ألا يكون تاريخ البداية بعد تاريخ النهاية.',
  },
  {
    code: 'END_BEFORE_START',
    en: 'endDate must not be before startDate',
    ar: 'يجب ألا يكون تاريخ النهاية قبل تاريخ البداية.',
  },
  {
    code: 'DATE_RANGE_REQUIRED',
    en: 'from and to are required',
    ar: 'يجب تحديد تاريخ البداية وتاريخ النهاية.',
  },
  {
    code: 'DATE_RANGE_INVALID',
    en: 'from date must be before or equal to to date',
    ar: 'يجب أن يكون تاريخ البداية قبل تاريخ النهاية أو مساويًا له.',
  },
  {
    code: 'MONTH_FORMAT_INVALID',
    en: 'month must be YYYY-MM',
    ar: 'يجب أن يكون الشهر بالصيغة YYYY-MM (مثل 2026-10).',
  },
  {
    code: 'PERIOD_TOO_LONG',
    en: 'The period must not be longer than {days} days',
    ar: 'يجب ألا تزيد الفترة على {days} يومًا.',
  },
  {
    code: 'PERIOD_LOCKED',
    en: 'Cannot modify transactions before lock date {lockDate}',
    ar: 'لا يمكن تعديل العمليات قبل تاريخ الإقفال {lockDate}.',
  },
  {
    code: 'PERIOD_LOCKED_ON_DATE',
    en: 'This period is locked. Transactions on or before {date} cannot be modified.',
    ar: 'هذه الفترة مقفلة. لا يمكن تعديل العمليات بتاريخ {date} أو قبله.',
  },
  {
    code: 'FISCAL_YEAR_CLOSED',
    en: 'Fiscal year {year} is closed and cannot accept new transactions',
    ar: 'السنة المالية {year} مقفلة ولا تقبل عمليات جديدة.',
  },
  {
    code: 'DOCUMENT_ALREADY_POSTED',
    en: '{documentType} {documentNumber} is already posted and cannot be modified',
    ar: 'المستند {documentType} رقم {documentNumber} مرحّل مسبقًا ولا يمكن تعديله.',
  },
  {
    code: 'DUPLICATE_DOCUMENT',
    en: '{documentType} with identifier {identifier} already exists',
    ar: 'يوجد مستند {documentType} بالمعرّف {identifier} مسبقًا.',
  },
  {
    code: 'DOCUMENT_NUMBER_TAKEN',
    en: '{label} number already exists; please retry',
    ar: 'رقم {label} مستخدم مسبقًا؛ حاول مرة أخرى.',
  },
  {
    code: 'INVALID_STATE_TRANSITION',
    en: 'Cannot transition from {from} to {to}. Allowed: {allowed}',
    ar: 'لا يمكن تغيير الحالة من {from} إلى {to}. الحالات المسموح بها: {allowed}',
  },
  {
    code: 'ORGANIZATION_LIMIT_REACHED',
    en: 'Organization limit reached for {resource}. Maximum: {limit}',
    ar: 'بلغت المنشأة الحد الأقصى المسموح به لـ {resource}. الحد الأقصى: {limit}',
  },
  {
    code: 'DOCUMENT_FOREIGN_CURRENCY',
    en: 'Document currency {currency} differs from the base currency {baseCurrency}; foreign-currency documents are not supported yet',
    ar: 'عملة المستند {currency} تختلف عن العملة الأساسية {baseCurrency}؛ المستندات بعملات أجنبية غير مدعومة حاليًا.',
  },
  {
    code: 'CURRENCY_MISMATCH',
    en: 'Currency mismatch. Expected: {expected}, Got: {actual}',
    ar: 'العملة غير مطابقة. المتوقع: {expected}، المُدخل: {actual}',
  },
  {
    code: 'CURRENCY_CODE_INVALID',
    en: 'currency must be a 3-letter ISO 4217 code',
    ar: 'يجب أن يكون رمز العملة من 3 أحرف إنجليزية حسب المعيار الدولي (مثل SAR أو EGP أو AED).',
  },
  {
    code: 'CURRENCY_CODE_LENGTH',
    en: 'Invalid currency code: {code}. Must be 3 characters.',
    ar: 'رمز العملة غير صالح: {code}. يجب أن يتكون من 3 أحرف.',
  },
  {
    code: 'QUANTITY_RATE_NEGATIVE',
    en: 'quantity and rate must not be negative',
    ar: 'لا يجوز أن تكون الكمية أو السعر بالسالب.',
  },
  {
    code: 'DISCOUNT_PERCENT_RANGE',
    en: 'discountPercent must be between 0 and 100',
    ar: 'يجب أن تكون نسبة الخصم بين 0 و100.',
  },
  {
    code: 'TAX_RATE_PERCENT_RANGE',
    en: 'taxRatePercent must be between 0 and 100',
    ar: 'يجب أن تكون نسبة الضريبة بين 0 و100.',
  },
  {
    code: 'TAX_RATE_RANGE',
    en: 'taxRate must be between 0 and 100',
    ar: 'يجب أن تكون نسبة الضريبة بين 0 و100.',
  },
  {
    code: 'RATE_RANGE',
    en: 'rate must be between 0 and 100',
    ar: 'يجب أن تكون النسبة بين 0 و100.',
  },
  {
    code: 'SHIPPING_NEGATIVE',
    en: 'shipping must not be negative',
    ar: 'لا يجوز أن تكون مصاريف الشحن بالسالب.',
  },
  {
    code: 'AMOUNT_NOT_POSITIVE',
    en: 'amount must be greater than zero',
    ar: 'يجب أن يكون المبلغ أكبر من صفر.',
  },
  {
    code: 'TAX_AMOUNT_TOO_LARGE',
    en: 'taxAmount must be less than the inclusive amount',
    ar: 'يجب أن يكون مبلغ الضريبة أقل من المبلغ شاملًا الضريبة.',
  },
  {
    code: 'LINES_REQUIRED',
    en: 'At least one line is required',
    ar: 'يجب إدخال بند واحد على الأقل.',
  },
  {
    code: 'LINE_DISCOUNT_ON_BILL',
    en: 'Line {line}: line discounts are not supported on bills; enter the net rate',
    ar: 'البند {line}: الخصم على مستوى البند غير مدعوم في فواتير الموردين؛ أدخِل السعر الصافي.',
  },
  {
    code: 'LINE_TAX_RATE_UNKNOWN',
    en: 'Line {line}: unknown taxRateId',
    ar: 'البند {line}: نسبة الضريبة المختارة غير معروفة.',
  },
  {
    code: 'LINE_TAX_RATE_MISMATCH',
    en: 'Line {line}: taxRatePercent does not match the selected tax rate',
    ar: 'البند {line}: نسبة الضريبة المُدخلة لا تطابق نسبة الضريبة المختارة.',
  },
  {
    code: 'LINE_TAX_RATE_UNRESOLVED',
    en: 'Line {line}: tax rate is unresolved; provide taxRatePercent (use "0" for no tax) or taxRateId',
    ar: 'البند {line}: لم تُحدَّد نسبة الضريبة؛ أدخِل النسبة (استخدم "0" إذا لم تكن هناك ضريبة) أو اختر نسبة ضريبة.',
  },
  {
    code: 'VENDOR_NOT_IN_ORGANIZATION',
    en: 'vendorId does not reference a vendor in this organization',
    ar: 'المورد المختار غير موجود في هذه المنشأة.',
  },
  {
    code: 'CUSTOMER_NOT_IN_ORGANIZATION',
    en: 'customerId does not reference a customer in this organization',
    ar: 'العميل المختار غير موجود في هذه المنشأة.',
  },
  {
    code: 'PROJECT_NOT_IN_ORGANIZATION',
    en: 'projectId does not reference a project in this organization',
    ar: 'المشروع المختار غير موجود في هذه المنشأة.',
  },
  {
    code: 'ITEM_NOT_IN_ORGANIZATION',
    en: 'itemId does not reference an item in this organization',
    ar: 'الصنف المختار غير موجود في هذه المنشأة.',
  },
  {
    code: 'ACCOUNT_NOT_IN_ORGANIZATION',
    en: 'accountId does not reference an active account in this organization',
    ar: 'الحساب المختار غير موجود أو غير نشط في هذه المنشأة.',
  },
  {
    code: 'TAX_RATE_NOT_IN_ORGANIZATION',
    en: 'taxRateId does not reference an active tax rate in this organization',
    ar: 'نسبة الضريبة المختارة غير موجودة أو غير نشطة في هذه المنشأة.',
  },
  {
    code: 'CUSTOMER_NOT_FOUND_IN_ORGANIZATION',
    en: 'Customer {id} not found for this organization',
    ar: 'العميل {id} غير موجود في هذه المنشأة.',
  },
  {
    code: 'VENDOR_NOT_FOUND_IN_ORGANIZATION',
    en: 'Vendor {id} not found for this organization',
    ar: 'المورد {id} غير موجود في هذه المنشأة.',
  },
  { code: 'IDS_REQUIRED', en: 'No IDs provided', ar: 'لم يتم تحديد أي سجلات.' },
  { code: 'FILE_NOT_UPLOADED', en: 'No file uploaded', ar: 'لم يتم رفع أي ملف.' },
  { code: 'FILE_REQUIRED', en: 'File is required', ar: 'يجب اختيار ملف.' },
  {
    code: 'FILE_TYPE_NOT_ALLOWED',
    en: 'Invalid file type. Allowed: JPEG, PNG, BMP, WebP, TIFF, HEIC, AVIF, PDF',
    ar: 'نوع الملف غير مسموح به. الأنواع المسموح بها: JPEG وPNG وBMP وWebP وTIFF وHEIC وAVIF وPDF.',
  },
  {
    code: 'STORAGE_KEY_INVALID',
    en: 'Invalid storage key',
    ar: 'تعذّر الوصول إلى الملف المخزّن.',
  },
  {
    code: 'EMAIL_NOT_CONFIGURED',
    en: 'Email is not configured. Please set up SMTP settings in organization settings.',
    ar: 'البريد الإلكتروني غير مهيّأ. أدخِل إعدادات خادم البريد (SMTP) في إعدادات المنشأة.',
  },
  {
    code: 'INTEGRATIONS_NOT_CONFIGURED',
    en: 'Integrations are not configured: set INTEGRATIONS_ENCRYPTION_KEY (32+ characters) on the API',
    ar: 'خدمة الربط مع الأنظمة الأخرى غير مهيّأة على الخادم. تواصل مع مسؤول النظام.',
  },
];

/** Chart of accounts, journals, opening balances, recurring profiles, assets. */
const ACCOUNTING_ERRORS: ErrorCatalogEntry[] = [
  { code: 'ACCOUNT_NOT_FOUND', en: 'Account not found', ar: 'الحساب غير موجود.' },
  {
    code: 'ACCOUNT_NOT_FOUND_OR_INACTIVE',
    en: 'Account {accountId} not found or not active',
    ar: 'الحساب {accountId} غير موجود أو غير نشط.',
  },
  {
    code: 'ACCOUNT_NOT_FOUND_BY_CODE',
    en: 'Account not found with code: {code}',
    ar: 'لا يوجد حساب بالرمز: {code}',
  },
  {
    code: 'ACCOUNTS_NOT_FOUND',
    en: 'One or more accounts not found',
    ar: 'حساب واحد أو أكثر غير موجود.',
  },
  {
    code: 'ACCOUNTS_NOT_IN_ORGANIZATION',
    en: 'One or more accounts were not found in this organization',
    ar: 'حساب واحد أو أكثر غير موجود في هذه المنشأة.',
  },
  {
    code: 'ACCOUNTS_INVALID_OR_INACTIVE',
    en: 'Invalid or inactive account IDs: {ids}',
    ar: 'حسابات غير صالحة أو غير نشطة: {ids}',
  },
  {
    code: 'NEGATIVE_BALANCE',
    en: 'Account {accountName} would have negative balance: {balance}',
    ar: 'سيصبح رصيد الحساب {accountName} سالبًا: {balance}',
  },
  {
    code: 'ACCOUNT_CODE_EXISTS',
    en: 'Account code already exists',
    ar: 'رمز الحساب مستخدم مسبقًا.',
  },
  {
    code: 'PARENT_ACCOUNT_NOT_FOUND',
    en: 'Parent account not found',
    ar: 'الحساب الرئيسي غير موجود.',
  },
  {
    code: 'CHILD_ACCOUNT_TYPE_MISMATCH',
    en: 'Child account type must match parent account type',
    ar: 'يجب أن يكون نوع الحساب الفرعي مطابقًا لنوع الحساب الرئيسي.',
  },
  {
    code: 'SYSTEM_ACCOUNT_IMMUTABLE',
    en: 'System accounts cannot be modified',
    ar: 'لا يمكن تعديل حسابات النظام.',
  },
  {
    code: 'ACCOUNT_SELF_PARENT',
    en: 'Account cannot be its own parent',
    ar: 'لا يمكن أن يكون الحساب رئيسيًا لنفسه.',
  },
  {
    code: 'SYSTEM_ACCOUNT_UNDELETABLE',
    en: 'System accounts cannot be deleted',
    ar: 'لا يمكن حذف حسابات النظام.',
  },
  {
    code: 'ACCOUNT_HAS_CHILDREN',
    en: 'Cannot delete account with child accounts',
    ar: 'لا يمكن حذف حساب له حسابات فرعية.',
  },
  {
    code: 'ACCOUNT_HAS_TRANSACTIONS',
    en: 'Cannot delete account with transactions',
    ar: 'لا يمكن حذف حساب عليه حركات.',
  },
  {
    code: 'LINKED_ACCOUNT_HAS_TRANSACTIONS',
    en: 'Account has transactions',
    ar: 'توجد حركات على هذا الحساب.',
  },
  {
    code: 'LINKED_ACCOUNT_REQUIRED',
    en: 'linkedAccountId is required',
    ar: 'يجب اختيار الحساب المرتبط.',
  },
  {
    code: 'CHART_EXISTS',
    en: 'Chart of accounts already exists. Cannot apply template.',
    ar: 'دليل الحسابات موجود مسبقًا. لا يمكن تطبيق القالب.',
  },
  {
    code: 'BASE_CURRENCY_LOCKED',
    en: 'The base currency cannot be changed after journals have been posted',
    ar: 'لا يمكن تغيير العملة الأساسية بعد ترحيل قيود.',
  },
  { code: 'JOURNAL_NOT_FOUND', en: 'Journal not found', ar: 'القيد غير موجود.' },
  { code: 'JOURNAL_DATE_INVALID', en: 'Invalid journal date', ar: 'تاريخ القيد غير صالح.' },
  {
    code: 'TRANSACTION_ALREADY_POSTED',
    en: 'This transaction has already been posted',
    ar: 'تم ترحيل هذه العملية مسبقًا.',
  },
  {
    code: 'JOURNAL_REVERSE_DRAFT',
    en: 'Only posted journals can be reversed; delete drafts',
    ar: 'يمكن عكس القيود المرحّلة فقط؛ أما المسودات فاحذفها.',
  },
  {
    code: 'JOURNAL_ALREADY_REVERSED',
    en: 'This journal has already been reversed',
    ar: 'تم عكس هذا القيد مسبقًا.',
  },
  {
    code: 'JOURNAL_REVERSE_REVERSAL',
    en: 'Cannot reverse a reversal journal',
    ar: 'لا يمكن عكس قيد عكسي.',
  },
  {
    code: 'SYSTEM_JOURNAL_REVERSE',
    en: 'System-generated journals are reversed by voiding their source document',
    ar: 'القيود التي ينشئها النظام تُعكس بإلغاء المستند الذي أنشأها.',
  },
  {
    code: 'JOURNAL_ALREADY_POSTED',
    en: 'Journal is already posted',
    ar: 'القيد مرحّل مسبقًا.',
  },
  {
    code: 'POSTED_JOURNAL_IMMUTABLE',
    en: 'Posted journals cannot be edited or deleted; create a reversal instead',
    ar: 'لا يمكن تعديل القيود المرحّلة أو حذفها؛ أنشئ قيدًا عكسيًا بدلًا من ذلك.',
  },
  {
    code: 'SYSTEM_JOURNAL_IMMUTABLE',
    en: 'System-generated journals cannot be edited; correct the source document instead',
    ar: 'لا يمكن تعديل القيود التي ينشئها النظام؛ صحّح المستند الأصلي بدلًا من ذلك.',
  },
  {
    code: 'JOURNAL_MIN_LINES',
    en: 'A journal needs at least two lines',
    ar: 'يحتاج القيد إلى سطرين على الأقل.',
  },
  {
    code: 'JOURNAL_UNBALANCED',
    en: 'Total debits must equal total credits',
    ar: 'يجب أن يتساوى إجمالي المدين مع إجمالي الدائن.',
  },
  {
    code: 'JOURNAL_NOT_BALANCED',
    en: 'Journal entry must balance. Debits: {debits}, Credits: {credits}',
    ar: 'يجب أن يتوازن القيد. المدين: {debits}، الدائن: {credits}',
  },
  {
    code: 'JOURNAL_LINE_DEBIT_OR_CREDIT',
    en: 'lines[{index}] must have either a debit or a credit amount (not both)',
    ar: 'يجب أن يحتوي السطر [{index}] على مبلغ مدين أو مبلغ دائن (وليس كليهما).',
  },
  {
    code: 'OPENING_DATE_INVALID',
    en: 'Invalid opening date',
    ar: 'تاريخ الأرصدة الافتتاحية غير صالح.',
  },
  {
    code: 'OPENING_BALANCES_POSTED',
    en: 'Opening balances have already been posted; send replaceExisting to reverse and repost them',
    ar: 'تم ترحيل الأرصدة الافتتاحية مسبقًا؛ اختر استبدال الأرصدة الحالية لعكسها وترحيلها من جديد.',
  },
  {
    code: 'OPENING_BALANCE_DUPLICATE_ACCOUNT',
    en: 'Each account can only appear once in the opening balances',
    ar: 'لا يجوز تكرار الحساب نفسه في الأرصدة الافتتاحية.',
  },
  {
    code: 'OPENING_EQUITY_ACCOUNT_INVALID',
    en: 'equityAccountId must be an active equity account of this organization',
    ar: 'يجب أن يكون حساب حقوق الملكية المختار حسابًا نشطًا من حسابات حقوق الملكية في هذه المنشأة.',
  },
  {
    code: 'OPENING_BALANCES_NO_EQUITY',
    en: 'The opening balances do not balance and no "{name}" equity account exists. Create one (or pass equityAccountId) so the difference can be posted.',
    ar: 'الأرصدة الافتتاحية غير متوازنة ولا يوجد حساب حقوق ملكية باسم "{name}". أنشئ هذا الحساب (أو اختر حساب حقوق ملكية) ليُرحَّل الفرق إليه.',
  },
  {
    code: 'OPENING_BALANCE_AMOUNT_INVALID',
    en: 'balances[{index}].amount must be a valid decimal number',
    ar: 'يجب أن يكون مبلغ الرصيد [{index}] رقمًا عشريًا صحيحًا.',
  },
  {
    code: 'OPENING_BALANCE_AMOUNT_NEGATIVE',
    en: 'balances[{index}].amount must be a non-negative number',
    ar: 'يجب ألا يكون مبلغ الرصيد [{index}] سالبًا.',
  },
  {
    code: 'RECURRING_PROFILE_NOT_FOUND',
    en: 'Recurring profile not found',
    ar: 'العملية المتكررة غير موجودة.',
  },
  {
    code: 'RECURRING_PROFILE_ENDED',
    en: 'This recurring profile has passed its end date',
    ar: 'تجاوزت هذه العملية المتكررة تاريخ انتهائها.',
  },
  {
    code: 'RECURRING_RUN_EXECUTED',
    en: 'This scheduled run was already executed',
    ar: 'تم تنفيذ هذا التشغيل المجدول مسبقًا.',
  },
  {
    code: 'RECURRING_TYPE_UNSUPPORTED',
    en: 'Unsupported recurring type: {type}',
    ar: 'نوع العملية المتكررة غير مدعوم: {type}',
  },
  {
    code: 'JOURNAL_TEMPLATE_EMPTY',
    en: 'Journal template has no lines',
    ar: 'قالب القيد لا يحتوي على أي سطور.',
  },
  {
    code: 'JOURNAL_TEMPLATE_MIN_LINES',
    en: 'A journal template needs at least two lines',
    ar: 'يحتاج قالب القيد إلى سطرين على الأقل.',
  },
  {
    code: 'JOURNAL_TEMPLATE_UNBALANCED',
    en: 'Journal template debits must equal credits',
    ar: 'يجب أن يتساوى المدين مع الدائن في قالب القيد.',
  },
  { code: 'ASSET_NOT_FOUND', en: 'Asset not found', ar: 'الأصل غير موجود.' },
  {
    code: 'ASSET_NOT_ACTIVE',
    en: 'Asset not found or not active',
    ar: 'الأصل غير موجود أو غير نشط.',
  },
  {
    code: 'ASSET_CLOSED',
    en: 'Cannot update a disposed or fully depreciated asset',
    ar: 'لا يمكن تعديل أصل تم استبعاده أو اكتمل إهلاكه.',
  },
  {
    code: 'ASSET_ALREADY_DISPOSED',
    en: 'Asset is already disposed',
    ar: 'تم استبعاد الأصل مسبقًا.',
  },
  {
    code: 'ASSET_HAS_DEPRECIATION',
    en: 'Cannot delete asset with posted depreciation. Dispose instead.',
    ar: 'لا يمكن حذف أصل له إهلاك مرحّل. استبعده بدلًا من ذلك.',
  },
  {
    code: 'DEPRECIATION_NOT_SCHEDULED',
    en: 'No depreciation scheduled for this period',
    ar: 'لا يوجد إهلاك مجدول لهذه الفترة.',
  },
  { code: 'AUDIT_LOG_NOT_FOUND', en: 'Audit log not found', ar: 'سجل التدقيق غير موجود.' },
  { code: 'LOG_ENTRY_NOT_FOUND', en: 'Log entry not found', ar: 'سجل الأحداث غير موجود.' },
];

/** Customers, quotes, invoices, credit notes, payments, delivery challans. */
const SALES_ERRORS: ErrorCatalogEntry[] = [
  {
    code: 'EXTERNAL_EINVOICE_REFERENCE_EXISTS',
    en: 'This ETA reference is already used in this organization',
    ar: 'مرجع الفاتورة الإلكترونية مستخدم بالفعل في هذه المنشأة.',
  },
  { code: 'CUSTOMER_NOT_FOUND', en: 'Customer not found', ar: 'العميل غير موجود.' },
  {
    code: 'CUSTOMER_EMAIL_EXISTS',
    en: 'A customer with this email already exists',
    ar: 'يوجد عميل بهذا البريد الإلكتروني مسبقًا.',
  },
  {
    code: 'CUSTOMER_HAS_INVOICES',
    en: 'Cannot delete customer with existing invoices',
    ar: 'لا يمكن حذف عميل له فواتير.',
  },
  {
    code: 'CUSTOMER_NOT_FOUND_BY_EMAIL',
    en: 'Customer not found with email: {email}',
    ar: 'لا يوجد عميل بالبريد الإلكتروني: {email}',
  },
  { code: 'INVOICE_NOT_FOUND', en: 'Invoice not found', ar: 'الفاتورة غير موجودة.' },
  {
    code: 'INVOICE_NOT_FOUND_BY_NUMBER',
    en: 'Invoice not found with number: {number}',
    ar: 'لا توجد فاتورة بالرقم: {number}',
  },
  {
    code: 'INVOICE_CUSTOMER_REQUIRED',
    en: 'Customer is required to create an invoice',
    ar: 'يجب اختيار العميل لإنشاء الفاتورة.',
  },
  {
    code: 'INVOICE_NUMBER_UNAVAILABLE',
    en: 'Could not allocate an invoice number; check Settings -> Invoicing',
    ar: 'تعذّر إصدار رقم للفاتورة؛ راجِع الإعدادات ← الفواتير.',
  },
  {
    code: 'INVOICE_UPDATE_NOT_DRAFT',
    en: 'Only draft invoices can be updated',
    ar: 'يمكن تعديل الفواتير في حالة المسودة فقط.',
  },
  {
    code: 'INVOICE_SEND_NOT_DRAFT',
    en: 'Only draft invoices can be sent',
    ar: 'يمكن إرسال الفواتير في حالة المسودة فقط.',
  },
  {
    code: 'INVOICE_DELETE_NOT_DRAFT',
    en: 'Only draft invoices can be deleted',
    ar: 'يمكن حذف الفواتير في حالة المسودة فقط.',
  },
  {
    code: 'INVOICE_CONCURRENT_SEND',
    en: 'Invoice was sent or changed concurrently',
    ar: 'تم إرسال الفاتورة أو تعديلها من مستخدم آخر في الوقت نفسه. حدّث الصفحة وحاول مرة أخرى.',
  },
  {
    code: 'INVOICE_CONCURRENT',
    en: 'Invoice changed concurrently',
    ar: 'تم تعديل الفاتورة من مستخدم آخر في الوقت نفسه. حدّث الصفحة وحاول مرة أخرى.',
  },
  { code: 'INVOICE_NO_LINES', en: 'Invoice has no lines', ar: 'الفاتورة لا تحتوي على أي بنود.' },
  {
    code: 'INVOICE_TOTAL_ZERO',
    en: 'Invoice total must be greater than zero before sending',
    ar: 'يجب أن يكون إجمالي الفاتورة أكبر من صفر قبل الإرسال.',
  },
  {
    code: 'INVOICE_ACCOUNTS_REQUIRED',
    en: 'Please configure default accounts (Accounts Receivable and Revenue) in organization settings before sending invoices',
    ar: 'حدّد الحسابات الافتراضية (الذمم المدينة والإيرادات) في إعدادات المنشأة قبل إرسال الفواتير.',
  },
  {
    code: 'VAT_PAYABLE_REQUIRED_INVOICES',
    en: 'Please configure the default VAT Payable account in organization settings before sending taxed invoices',
    ar: 'حدّد حساب ضريبة القيمة المضافة المستحقة الافتراضي في إعدادات المنشأة قبل إرسال فواتير خاضعة للضريبة.',
  },
  {
    code: 'INVOICE_ALREADY_SENT',
    en: 'Invoice has already been sent',
    ar: 'تم إرسال الفاتورة مسبقًا.',
  },
  { code: 'INVOICE_ALREADY_VOID', en: 'Invoice is already void', ar: 'الفاتورة ملغاة مسبقًا.' },
  {
    code: 'INVOICE_ALREADY_PAID',
    en: 'Invoice {invoiceNumber} has already been paid ({paidAmount})',
    ar: 'الفاتورة {invoiceNumber} مدفوعة مسبقًا ({paidAmount}).',
  },
  {
    code: 'INVOICE_VOID_HAS_PAYMENTS',
    en: 'Cannot void an invoice with payments applied; void the payments first',
    ar: 'لا يمكن إلغاء فاتورة عليها دفعات؛ ألغِ الدفعات أولًا.',
  },
  {
    code: 'INVOICE_VOID_HAS_CREDIT_NOTES',
    en: 'Cannot void an invoice with credit notes; void the credit notes first',
    ar: 'لا يمكن إلغاء فاتورة عليها إشعارات دائنة؛ ألغِ الإشعارات الدائنة أولًا.',
  },
  {
    code: 'INVOICE_NO_LEDGER',
    en: 'This invoice has no linked ledger entry; reverse its journal manually before voiding',
    ar: 'هذه الفاتورة ليس لها قيد مرتبط في دفتر الأستاذ؛ اعكس قيدها يدويًا قبل الإلغاء.',
  },
  {
    code: 'INVOICE_NO_DELIVERABLE_GOODS',
    en: 'Invoice has no deliverable goods items',
    ar: 'الفاتورة لا تحتوي على أصناف بضاعة قابلة للتسليم.',
  },
  {
    code: 'INVOICE_CUSTOMER_MISMATCH',
    en: 'Invoice does not belong to this customer',
    ar: 'الفاتورة لا تخص هذا العميل.',
  },
  {
    code: 'INVOICE_OTHER_CUSTOMER',
    en: 'Invoice {number} belongs to a different customer',
    ar: 'الفاتورة {number} تخص عميلًا آخر.',
  },
  {
    code: 'INVOICE_NOT_OPEN_FOR_PAYMENT',
    en: 'Invoice {number} is not open for payment',
    ar: 'الفاتورة {number} غير مفتوحة للسداد.',
  },
  {
    code: 'INVOICE_NOT_OPEN_FOR_CREDIT',
    en: 'Invoice {number} is not open for credit',
    ar: 'الفاتورة {number} غير مفتوحة لإصدار إشعار دائن.',
  },
  {
    code: 'PAYMENT_RETRY_MISMATCH',
    en: 'This payment was already recorded with different details',
    ar: 'سُجِّلت هذه الدفعة من قبل ببيانات مختلفة. افتح قائمة المدفوعات للتأكد قبل تسجيلها مرة أخرى.',
  },
  {
    code: 'INVOICE_ALLOCATION_EXCEEDS_BALANCE',
    en: 'Allocation exceeds the balance due on invoice {number}',
    ar: 'المبلغ المخصّص أكبر من الرصيد المستحق على الفاتورة {number}.',
  },
  {
    code: 'INVOICE_CREDIT_EXCEEDS_BALANCE',
    en: 'Credit exceeds the balance due on invoice {number}',
    ar: 'مبلغ الإشعار الدائن أكبر من الرصيد المستحق على الفاتورة {number}.',
  },
  {
    code: 'INVOICE_CREDIT_NOTES_EXCEED_TOTAL',
    en: 'Credit notes would exceed the total of invoice {number}',
    ar: 'ستتجاوز الإشعارات الدائنة إجمالي الفاتورة {number}.',
  },
  {
    code: 'INVOICE_FOREIGN_CURRENCY',
    en: 'Invoice currency {currency} differs from the base currency {baseCurrency}; foreign-currency invoices cannot be posted yet',
    ar: 'عملة الفاتورة {currency} تختلف عن العملة الأساسية {baseCurrency}؛ لا يمكن ترحيل فواتير بعملات أجنبية حاليًا.',
  },
  {
    code: 'INVOICE_NOT_FOUND_FOR_BALANCE',
    en: 'Invoice {id} not found for balance update',
    ar: 'الفاتورة {id} غير موجودة لتحديث الرصيد.',
  },
  {
    code: 'INVOICE_ALLOCATION_DUPLICATE',
    en: 'Each invoice can only be allocated once per payment',
    ar: 'لا يجوز تخصيص الفاتورة نفسها أكثر من مرة في الدفعة الواحدة.',
  },
  {
    code: 'PAYMENT_EXCEEDS_BALANCE',
    en: 'Payment amount {amount} exceeds outstanding balance {balance}',
    ar: 'مبلغ الدفعة {amount} أكبر من الرصيد المستحق {balance}.',
  },
  {
    code: 'DEPOSIT_ACCOUNT_INVALID',
    en: 'Deposit account not found or inactive',
    ar: 'حساب الإيداع غير موجود أو غير نشط.',
  },
  {
    code: 'DEPOSIT_ACCOUNT_REQUIRED',
    en: 'Choose a deposit account or configure a default bank account in organization settings',
    ar: 'اختر حساب الإيداع أو حدّد حسابًا بنكيًا افتراضيًا في إعدادات المنشأة.',
  },
  {
    code: 'AR_ACCOUNT_REQUIRED_PAYMENTS',
    en: 'Please configure default Accounts Receivable account in organization settings before recording payments',
    ar: 'حدّد حساب الذمم المدينة الافتراضي في إعدادات المنشأة قبل تسجيل الدفعات.',
  },
  {
    code: 'PAYMENT_VOID_HAS_REFUNDS',
    en: 'Cannot void this payment: refund credit notes on the invoice depend on it; void the refund credit note first',
    ar: 'لا يمكن إلغاء هذه الدفعة لأن إشعارات استرداد دائنة على الفاتورة تعتمد عليها؛ ألغِ إشعار الاسترداد أولًا.',
  },
  { code: 'QUOTE_NOT_FOUND', en: 'Quote not found', ar: 'عرض السعر غير موجود.' },
  {
    code: 'QUOTE_NUMBER_UNAVAILABLE',
    en: 'Could not allocate a quote number; check Settings -> Invoicing',
    ar: 'تعذّر إصدار رقم لعرض السعر؛ راجِع الإعدادات ← الفواتير.',
  },
  {
    code: 'QUOTE_UPDATE_NOT_DRAFT',
    en: 'Only draft quotes can be updated',
    ar: 'يمكن تعديل عروض الأسعار في حالة المسودة فقط.',
  },
  {
    code: 'QUOTE_DELETE_NOT_DRAFT',
    en: 'Only draft quotes can be deleted',
    ar: 'يمكن حذف عروض الأسعار في حالة المسودة فقط.',
  },
  {
    code: 'QUOTE_SEND_NOT_DRAFT',
    en: 'Only draft quotes can be sent',
    ar: 'يمكن إرسال عروض الأسعار في حالة المسودة فقط.',
  },
  {
    code: 'QUOTE_ACCEPT_NOT_SENT',
    en: 'Only sent quotes can be accepted',
    ar: 'يمكن قبول عروض الأسعار المُرسلة فقط.',
  },
  {
    code: 'QUOTE_DECLINE_NOT_SENT',
    en: 'Only sent quotes can be declined',
    ar: 'يمكن رفض عروض الأسعار المُرسلة فقط.',
  },
  {
    code: 'QUOTE_CONCURRENT',
    en: 'Quote was sent or changed concurrently',
    ar: 'تم إرسال عرض السعر أو تعديله من مستخدم آخر في الوقت نفسه. حدّث الصفحة وحاول مرة أخرى.',
  },
  {
    code: 'QUOTE_CONVERT_NOT_ACCEPTED',
    en: 'Only accepted quotes can be converted',
    ar: 'يمكن تحويل عروض الأسعار المقبولة فقط.',
  },
  { code: 'QUOTE_NO_LINES', en: 'Quote has no lines', ar: 'عرض السعر لا يحتوي على أي بنود.' },
  {
    code: 'QUOTE_TOTALS_MISMATCH',
    en: 'Quote totals do not match its lines; correct the quote before converting it',
    ar: 'إجماليات عرض السعر لا تطابق بنوده؛ صحّح عرض السعر قبل تحويله.',
  },
  {
    code: 'QUOTE_ALREADY_CONVERTED',
    en: 'Quote has already been converted',
    ar: 'تم تحويل عرض السعر مسبقًا.',
  },
  {
    code: 'QUOTE_CUSTOMER_MISMATCH',
    en: 'Quote belongs to a different customer',
    ar: 'عرض السعر يخص عميلًا آخر.',
  },
  { code: 'CREDIT_NOTE_NOT_FOUND', en: 'Credit note not found', ar: 'الإشعار الدائن غير موجود.' },
  {
    code: 'CREDIT_NOTE_TYPE_INVALID',
    en: 'type must be REFUND or APPLY_TO_INVOICE',
    ar: 'يجب أن يكون نوع الإشعار الدائن استردادًا أو تطبيقًا على فاتورة.',
  },
  {
    code: 'REFUND_ACCOUNT_NOT_REFUND',
    en: 'A refund account is only valid for REFUND credit notes',
    ar: 'يُستخدم حساب الاسترداد مع إشعارات الاسترداد الدائنة فقط.',
  },
  {
    code: 'CREDIT_NOTE_APPLY_TYPE',
    en: 'Only APPLY_TO_INVOICE credit notes can be applied to an invoice',
    ar: 'يمكن تطبيق الإشعارات الدائنة من نوع "تطبيق على فاتورة" فقط على الفواتير.',
  },
  {
    code: 'CREDIT_NOTE_APPLY_ONLY',
    en: 'Only APPLY_TO_INVOICE credit notes can be applied',
    ar: 'يمكن تطبيق الإشعارات الدائنة من نوع "تطبيق على فاتورة" فقط.',
  },
  {
    code: 'REFUND_ACCOUNT_REQUIRED',
    en: 'Choose the bank or cash account the refund is paid from',
    ar: 'اختر الحساب البنكي أو النقدي الذي يُدفع منه الاسترداد.',
  },
  {
    code: 'CREDIT_NOTE_INVOICE_NOT_SENT',
    en: 'Credit notes can only be issued against a sent invoice',
    ar: 'يمكن إصدار إشعار دائن مقابل فاتورة مُرسلة فقط.',
  },
  {
    code: 'CREDIT_NOTE_ACCOUNTS_REQUIRED',
    en: 'Please configure default accounts (Accounts Receivable and Sales Returns) in organization settings before creating credit notes',
    ar: 'حدّد الحسابات الافتراضية (الذمم المدينة ومردودات المبيعات) في إعدادات المنشأة قبل إنشاء إشعارات دائنة.',
  },
  {
    code: 'VAT_PAYABLE_REQUIRED_CREDIT_NOTES',
    en: 'Please configure the default VAT Payable account in organization settings before crediting taxed invoices',
    ar: 'حدّد حساب ضريبة القيمة المضافة المستحقة الافتراضي في إعدادات المنشأة قبل إصدار إشعار دائن لفواتير خاضعة للضريبة.',
  },
  {
    code: 'CREDIT_NOTE_NO_LEDGER',
    en: 'This credit note has no linked ledger entry; reverse its journal manually before voiding',
    ar: 'هذا الإشعار الدائن ليس له قيد مرتبط في دفتر الأستاذ؛ اعكس قيده يدويًا قبل الإلغاء.',
  },
  {
    code: 'CREDIT_NOTE_ALREADY_APPLIED',
    en: 'Credit note is already applied to an invoice',
    ar: 'تم تطبيق الإشعار الدائن على فاتورة مسبقًا.',
  },
  {
    code: 'CREDIT_NOTE_CONCURRENT',
    en: 'Credit note was applied concurrently',
    ar: 'تم تطبيق الإشعار الدائن من مستخدم آخر في الوقت نفسه.',
  },
  {
    code: 'REFUND_EXCEEDS_RECEIVED',
    en: 'Refund exceeds the amount received on this invoice',
    ar: 'مبلغ الاسترداد أكبر من المبلغ المحصّل على هذه الفاتورة.',
  },
  {
    code: 'CHALLAN_NOT_FOUND',
    en: 'Delivery challan not found',
    ar: 'إذن التسليم غير موجود.',
  },
  {
    code: 'CHALLAN_UPDATE_NOT_DRAFT',
    en: 'Only draft challans can be updated',
    ar: 'يمكن تعديل أذونات التسليم في حالة المسودة فقط.',
  },
  {
    code: 'CHALLAN_DELETE_NOT_DRAFT',
    en: 'Only draft challans can be deleted',
    ar: 'يمكن حذف أذونات التسليم في حالة المسودة فقط.',
  },
  {
    code: 'CHALLAN_ISSUE_NOT_DRAFT',
    en: 'Only draft challans can be issued',
    ar: 'يمكن إصدار أذونات التسليم في حالة المسودة فقط.',
  },
  {
    code: 'CHALLAN_RETURN_NOT_ISSUED',
    en: 'Only issued challans can be marked as returned',
    ar: 'يمكن تسجيل الإرجاع لأذونات التسليم الصادرة فقط.',
  },
];

/** Vendors, bills, expenses, bill payments, vendor credits. */
const PURCHASES_ERRORS: ErrorCatalogEntry[] = [
  { code: 'VENDOR_NOT_FOUND', en: 'Vendor not found', ar: 'المورد غير موجود.' },
  {
    code: 'VENDOR_NOT_FOUND_BY_EMAIL',
    en: 'Vendor not found with email: {email}',
    ar: 'لا يوجد مورد بالبريد الإلكتروني: {email}',
  },
  {
    code: 'VENDOR_HAS_BILLS',
    en: 'Cannot delete vendor with bills',
    ar: 'لا يمكن حذف مورد له فواتير.',
  },
  { code: 'BILL_NOT_FOUND', en: 'Bill not found', ar: 'فاتورة المورد غير موجودة.' },
  {
    code: 'BILL_NOT_FOUND_BY_NUMBER',
    en: 'Bill not found with number: {number}',
    ar: 'لا توجد فاتورة مورد بالرقم: {number}',
  },
  {
    code: 'TARGET_BILL_NOT_FOUND',
    en: 'Target bill not found',
    ar: 'فاتورة المورد المستهدفة غير موجودة.',
  },
  {
    code: 'BILL_VENDOR_REQUIRED',
    en: 'Vendor is required to create a bill',
    ar: 'يجب اختيار المورد لإنشاء فاتورة المورد.',
  },
  {
    code: 'BILL_NUMBER_UNAVAILABLE',
    en: 'Could not allocate a bill number; provide one explicitly',
    ar: 'تعذّر إصدار رقم لفاتورة المورد؛ أدخِل الرقم يدويًا.',
  },
  {
    code: 'BILL_NUMBER_EXISTS',
    en: 'A bill with this number already exists for this vendor',
    ar: 'توجد فاتورة بهذا الرقم لهذا المورد مسبقًا.',
  },
  {
    code: 'BILL_UPDATE_NOT_DRAFT',
    en: 'Only draft bills can be updated',
    ar: 'يمكن تعديل فواتير الموردين في حالة المسودة فقط.',
  },
  {
    code: 'BILL_APPROVE_NOT_DRAFT',
    en: 'Only draft bills can be approved',
    ar: 'يمكن اعتماد فواتير الموردين في حالة المسودة فقط.',
  },
  {
    code: 'BILL_DELETE_NOT_DRAFT',
    en: 'Only draft bills can be deleted',
    ar: 'يمكن حذف فواتير الموردين في حالة المسودة فقط.',
  },
  {
    code: 'BILL_APPROVED_CONCURRENTLY',
    en: 'Bill was approved concurrently',
    ar: 'تم اعتماد فاتورة المورد من مستخدم آخر في الوقت نفسه.',
  },
  {
    code: 'BILL_ALREADY_APPROVED',
    en: 'Bill has already been approved',
    ar: 'تم اعتماد فاتورة المورد مسبقًا.',
  },
  { code: 'BILL_NO_LINES', en: 'Bill has no lines', ar: 'فاتورة المورد لا تحتوي على أي بنود.' },
  {
    code: 'accountRequired',
    en: 'All bill lines must have an expense account assigned before approval',
    ar: 'يجب تحديد حساب مصروف لكل بنود فاتورة المورد قبل الاعتماد.',
  },
  {
    code: 'accountInvalidType',
    en: 'Bill line accounts must be active expense or asset accounts, not payables, receivables, VAT, bank or cash',
    ar: 'يجب أن تكون حسابات بنود فاتورة المورد حسابات مصروفات أو أصول نشطة، وليست حسابات دائنين أو مدينين أو ضريبة قيمة مضافة أو بنوك أو نقدية.',
  },
  {
    code: 'AP_ACCOUNT_REQUIRED_BILLS',
    en: 'Please configure default Accounts Payable account in organization settings before approving bills',
    ar: 'حدّد حساب الدائنين الافتراضي في إعدادات المنشأة قبل اعتماد فواتير الموردين.',
  },
  {
    code: 'VAT_RECEIVABLE_REQUIRED_BILLS',
    en: 'Please configure default VAT Receivable account in organization settings before approving taxed bills',
    ar: 'حدّد حساب ضريبة القيمة المضافة القابلة للاسترداد الافتراضي في إعدادات المنشأة قبل اعتماد فواتير موردين خاضعة للضريبة.',
  },
  {
    code: 'BILL_OTHER_VENDOR',
    en: 'Bill {number} belongs to a different vendor',
    ar: 'فاتورة المورد {number} تخص موردًا آخر.',
  },
  {
    code: 'BILL_VENDOR_MISMATCH',
    en: 'Bill does not belong to this vendor',
    ar: 'فاتورة المورد لا تخص هذا المورد.',
  },
  {
    code: 'BILL_NOT_OPEN_FOR_PAYMENT',
    en: 'Bill {number} is not open for payment',
    ar: 'فاتورة المورد {number} غير مفتوحة للسداد.',
  },
  {
    code: 'BILL_NOT_OPEN_FOR_CREDIT',
    en: 'Bill {number} is not open for credit',
    ar: 'فاتورة المورد {number} غير مفتوحة لإصدار إشعار دائن.',
  },
  {
    code: 'BILL_ALLOCATION_EXCEEDS_BALANCE',
    en: 'Allocation exceeds the balance due on bill {number}',
    ar: 'المبلغ المخصّص أكبر من الرصيد المستحق على فاتورة المورد {number}.',
  },
  {
    code: 'BILL_CREDIT_EXCEEDS_BALANCE',
    en: 'Credit exceeds the balance due on bill {number}',
    ar: 'مبلغ الإشعار الدائن أكبر من الرصيد المستحق على فاتورة المورد {number}.',
  },
  {
    code: 'BILL_VENDOR_CREDITS_EXCEED_TOTAL',
    en: 'Vendor credits would exceed the total of bill {number}',
    ar: 'ستتجاوز الإشعارات الدائنة من المورد إجمالي فاتورة المورد {number}.',
  },
  {
    code: 'BILL_FOREIGN_CURRENCY',
    en: 'Bill currency {currency} differs from the base currency {baseCurrency}; foreign-currency bills cannot be posted yet',
    ar: 'عملة فاتورة المورد {currency} تختلف عن العملة الأساسية {baseCurrency}؛ لا يمكن ترحيل فواتير موردين بعملات أجنبية حاليًا.',
  },
  {
    code: 'VENDOR_CREDIT_FOREIGN_CURRENCY',
    en: 'Bill currency {currency} differs from the base currency {baseCurrency}; foreign-currency credits cannot be posted yet',
    ar: 'عملة فاتورة المورد {currency} تختلف عن العملة الأساسية {baseCurrency}؛ لا يمكن ترحيل إشعارات دائنة بعملات أجنبية حاليًا.',
  },
  {
    code: 'BILL_NOT_FOUND_FOR_BALANCE',
    en: 'Bill {id} not found for balance update',
    ar: 'فاتورة المورد {id} غير موجودة لتحديث الرصيد.',
  },
  {
    code: 'BILL_ALLOCATION_DUPLICATE',
    en: 'Each bill can only be allocated once per payment',
    ar: 'لا يجوز تخصيص فاتورة المورد نفسها أكثر من مرة في الدفعة الواحدة.',
  },
  {
    code: 'ALLOCATION_NOT_EQUAL_PAYMENT',
    en: 'Allocation must equal payment',
    ar: 'يجب أن يساوي إجمالي المبالغ المخصّصة مبلغ الدفعة.',
  },
  { code: 'PAYMENT_NOT_FOUND', en: 'Payment not found', ar: 'الدفعة غير موجودة.' },
  { code: 'PAYMENT_DATE_INVALID', en: 'Invalid payment date', ar: 'تاريخ الدفعة غير صالح.' },
  {
    code: 'PAID_FROM_ACCOUNT_NOT_FOUND',
    en: 'Paid-from account not found',
    ar: 'حساب الدفع غير موجود.',
  },
  {
    code: 'PAID_FROM_ACCOUNT_REQUIRED',
    en: 'Choose a paid-from account or configure a default bank account in organization settings',
    ar: 'اختر حساب الدفع أو حدّد حسابًا بنكيًا افتراضيًا في إعدادات المنشأة.',
  },
  {
    code: 'AP_ACCOUNT_REQUIRED_PAYMENTS',
    en: 'Please configure default Accounts Payable account in organization settings before recording payments',
    ar: 'حدّد حساب الدائنين الافتراضي في إعدادات المنشأة قبل تسجيل الدفعات.',
  },
  {
    code: 'PAYMENT_NO_LEDGER',
    en: 'This payment has no linked ledger entry; reverse its journal manually before voiding',
    ar: 'هذه الدفعة ليس لها قيد مرتبط في دفتر الأستاذ؛ اعكس قيدها يدويًا قبل الإلغاء.',
  },
  { code: 'EXPENSE_NOT_FOUND', en: 'Expense not found', ar: 'المصروف غير موجود.' },
  {
    code: 'EXPENSE_ACCOUNT_INVALID',
    en: 'Expense account must be an active expense account',
    ar: 'يجب أن يكون حساب المصروف حساب مصروفات نشطًا.',
  },
  {
    code: 'PAID_THROUGH_ACCOUNT_INVALID',
    en: 'Paid-through account must be an active bank or cash account of this organization',
    ar: 'يجب أن يكون حساب الدفع حسابًا بنكيًا أو نقديًا نشطًا في هذه المنشأة.',
  },
  {
    code: 'BANK_OR_CASH_ACCOUNT_REQUIRED',
    en: '{label} {code} must be an active bank or cash account of this organization',
    ar: 'يجب أن يكون {label} {code} حسابًا بنكيًا أو نقديًا نشطًا في هذه المنشأة.',
  },
  {
    code: 'VAT_RECEIVABLE_REQUIRED_EXPENSES',
    en: 'Please configure the default VAT Receivable account in organization settings before recording taxed expenses',
    ar: 'حدّد حساب ضريبة القيمة المضافة القابلة للاسترداد الافتراضي في إعدادات المنشأة قبل تسجيل مصروفات خاضعة للضريبة.',
  },
  {
    code: 'EXPENSE_POST_NOT_PENDING',
    en: 'Only pending expenses can be posted',
    ar: 'يمكن ترحيل المصروفات المعلّقة فقط.',
  },
  {
    code: 'EXPENSE_CONCURRENT',
    en: 'Expense was changed concurrently',
    ar: 'تم تعديل المصروف من مستخدم آخر في الوقت نفسه. حدّث الصفحة وحاول مرة أخرى.',
  },
  {
    code: 'EXPENSE_NO_LEDGER',
    en: 'This expense has no linked ledger entry; reverse its journal manually before voiding',
    ar: 'هذا المصروف ليس له قيد مرتبط في دفتر الأستاذ؛ اعكس قيده يدويًا قبل الإلغاء.',
  },
  {
    code: 'EXPENSE_RECATEGORISE_POSTED',
    en: 'Posted expenses cannot be re-categorised; void the expense and enter it again',
    ar: 'لا يمكن إعادة تصنيف مصروف مرحّل؛ ألغِ المصروف وأدخله من جديد.',
  },
  {
    code: 'VENDOR_CREDIT_NOT_FOUND',
    en: 'Vendor credit not found',
    ar: 'الإشعار الدائن من المورد غير موجود.',
  },
  {
    code: 'VENDOR_CREDIT_BILL_NOT_POSTED',
    en: 'Vendor credits can only be issued against a posted bill',
    ar: 'يمكن إصدار إشعار دائن من المورد مقابل فاتورة مورد مرحّلة فقط.',
  },
  {
    code: 'AP_ACCOUNT_REQUIRED_VENDOR_CREDITS',
    en: 'Please configure the default Accounts Payable account in organization settings before creating vendor credits',
    ar: 'حدّد حساب الدائنين الافتراضي في إعدادات المنشأة قبل إنشاء إشعارات دائنة من الموردين.',
  },
  {
    code: 'VAT_RECEIVABLE_REQUIRED_VENDOR_CREDITS',
    en: 'Please configure the default VAT Receivable account in organization settings before crediting taxed bills',
    ar: 'حدّد حساب ضريبة القيمة المضافة القابلة للاسترداد الافتراضي في إعدادات المنشأة قبل إصدار إشعار دائن لفواتير موردين خاضعة للضريبة.',
  },
  {
    code: 'VENDOR_CREDIT_ALREADY_APPLIED',
    en: 'Vendor credit is already applied to a bill',
    ar: 'تم تطبيق الإشعار الدائن من المورد على فاتورة مسبقًا.',
  },
  {
    code: 'VENDOR_CREDIT_REFUNDED_APPLY',
    en: 'A refunded vendor credit cannot be applied',
    ar: 'لا يمكن تطبيق إشعار دائن من المورد تم استرداده.',
  },
  {
    code: 'VENDOR_CREDIT_CONCURRENT',
    en: 'Vendor credit was changed concurrently',
    ar: 'تم تعديل الإشعار الدائن من المورد من مستخدم آخر في الوقت نفسه. حدّث الصفحة وحاول مرة أخرى.',
  },
  {
    code: 'REFUND_BEFORE_CREDIT',
    en: 'The refund date cannot be earlier than the credit date',
    ar: 'لا يمكن أن يسبق تاريخ الاسترداد تاريخ الإشعار الدائن.',
  },
  {
    code: 'VENDOR_CREDIT_ALREADY_REFUNDED',
    en: 'Vendor credit has already been refunded',
    ar: 'تم استرداد الإشعار الدائن من المورد مسبقًا.',
  },
  {
    code: 'VENDOR_CREDIT_APPLIED_REFUND',
    en: 'An applied vendor credit cannot be refunded',
    ar: 'لا يمكن استرداد إشعار دائن من المورد تم تطبيقه.',
  },
  {
    code: 'REFUND_ACCOUNT_INVALID',
    en: 'Refund account must be an active bank or cash account of this organization',
    ar: 'يجب أن يكون حساب الاسترداد حسابًا بنكيًا أو نقديًا نشطًا في هذه المنشأة.',
  },
  {
    code: 'VENDOR_CREDIT_NO_LEDGER_REFUND',
    en: 'This vendor credit has no linked ledger entry; it cannot be refunded',
    ar: 'هذا الإشعار الدائن من المورد ليس له قيد مرتبط في دفتر الأستاذ؛ لا يمكن استرداده.',
  },
  {
    code: 'VENDOR_CREDIT_VOID_STATE',
    en: 'Only unapplied, unrefunded vendor credits can be voided',
    ar: 'يمكن إلغاء الإشعارات الدائنة من الموردين غير المطبّقة وغير المستردّة فقط.',
  },
  {
    code: 'VENDOR_CREDIT_NO_LEDGER_VOID',
    en: 'This vendor credit has no linked ledger entry; reverse its journal manually before voiding',
    ar: 'هذا الإشعار الدائن من المورد ليس له قيد مرتبط في دفتر الأستاذ؛ اعكس قيده يدويًا قبل الإلغاء.',
  },
  {
    code: 'CREDIT_ACCOUNT_NOT_ON_BILL',
    en: 'Credit account must be one of the accounts on the bill',
    ar: 'يجب أن يكون الحساب الدائن أحد الحسابات الواردة في فاتورة المورد.',
  },
  {
    code: 'BILL_NO_ACCOUNT_LINES',
    en: 'The bill has no account lines to credit',
    ar: 'فاتورة المورد لا تحتوي على بنود حسابات يمكن إصدار إشعار دائن لها.',
  },
];

/** Bank accounts, statements, rules, reconciliation, currencies. */
const BANKING_ERRORS: ErrorCatalogEntry[] = [
  { code: 'BANK_ACCOUNT_NOT_FOUND', en: 'Bank account not found', ar: 'الحساب البنكي غير موجود.' },
  {
    code: 'BANK_ACCOUNT_ID_REQUIRED',
    en: 'Bank account ID is required',
    ar: 'يجب اختيار الحساب البنكي.',
  },
  {
    code: 'BANK_FILE_TYPE_NOT_ALLOWED',
    en: 'Only CSV, Excel, and OFX/QFX files are allowed',
    ar: 'الملفات المسموح بها فقط: CSV وExcel وOFX/QFX.',
  },
  {
    code: 'BANK_OPENING_BALANCE_NOT_HERE',
    en: 'Record opening bank balances through Opening Balances (Accounting → Opening Balances)',
    ar: 'سجّل الأرصدة الافتتاحية للبنوك من شاشة الأرصدة الافتتاحية (المحاسبة ← الأرصدة الافتتاحية).',
  },
  {
    code: 'BANK_LEDGER_ACCOUNT_TAKEN',
    en: 'This ledger account is already linked to the bank account "{name}". Each bank account needs its own ledger account.',
    ar: 'حساب دفتر الأستاذ هذا مرتبط بالفعل بالحساب البنكي "{name}". يحتاج كل حساب بنكي إلى حساب خاص به في دفتر الأستاذ.',
  },
  {
    code: 'LINKED_LEDGER_ACCOUNT_NOT_FOUND',
    en: 'Linked ledger account not found',
    ar: 'حساب دفتر الأستاذ المرتبط غير موجود.',
  },
  {
    code: 'BANK_RULE_NOT_FOUND',
    en: 'Bank rule not found',
    ar: 'قاعدة التصنيف البنكية غير موجودة.',
  },
  {
    code: 'BANK_RULES_NOT_FOUND',
    en: 'One or more rules not found',
    ar: 'قاعدة واحدة أو أكثر غير موجودة.',
  },
  {
    code: 'BANK_FILE_EMPTY',
    en: 'No transactions found in file',
    ar: 'لم يتم العثور على أي حركات في الملف.',
  },
  { code: 'TRANSACTION_NOT_FOUND', en: 'Transaction not found', ar: 'الحركة غير موجودة.' },
  {
    code: 'TRANSACTION_ALREADY_RECONCILED',
    en: 'Already reconciled',
    ar: 'تمت مطابقة هذه الحركة مسبقًا.',
  },
  {
    code: 'RECONCILE_ENTITY_TYPE_INVALID',
    en: 'entityType must be invoice, bill, payment_received or payment_made',
    ar: 'يجب أن تكون المطابقة مع فاتورة أو فاتورة مورد أو دفعة مسجلة.',
  },
  {
    code: 'EXPENSE_NEEDS_WITHDRAWAL',
    en: 'Only withdrawals can be recorded as expenses',
    ar: 'يمكن تسجيل السحوبات فقط كمصروفات.',
  },
  {
    code: 'INVOICE_MATCH_NEEDS_DEPOSIT',
    en: 'Only deposits can be matched to a customer payment',
    ar: 'يمكن مطابقة الإيداعات فقط مع دفعات العملاء.',
  },
  {
    code: 'BILL_MATCH_NEEDS_WITHDRAWAL',
    en: 'Only withdrawals can be matched to a vendor payment',
    ar: 'يمكن مطابقة السحوبات فقط مع دفعات الموردين.',
  },
  {
    code: 'MATCH_PAYMENT_OTHER_BANK',
    en: 'This payment was recorded to a different bank account',
    ar: 'هذه الدفعة مسجلة على حساب بنكي آخر.',
  },
  {
    code: 'MATCH_PAYMENT_AMOUNT_DIFFERS',
    en: 'The payment amount differs from the bank line',
    ar: 'مبلغ الدفعة يختلف عن مبلغ سطر البنك.',
  },
  {
    code: 'MATCH_PAYMENT_ALREADY_MATCHED',
    en: 'This payment is already matched to another bank line',
    ar: 'هذه الدفعة مطابقة بالفعل مع سطر بنكي آخر.',
  },
  {
    code: 'BANK_ACCOUNT_NOT_FOUND_FOR_BALANCE',
    en: 'Bank account {id} not found for balance update',
    ar: 'الحساب البنكي {id} غير موجود لتحديث الرصيد.',
  },
  {
    code: 'RECONCILE_INVOICE_NOT_FOUND',
    en: 'Invoice {id} not found for reconciliation payment',
    ar: 'الفاتورة {id} غير موجودة لدفعة المطابقة.',
  },
  {
    code: 'RECONCILE_BILL_NOT_FOUND',
    en: 'Bill {id} not found for reconciliation payment',
    ar: 'فاتورة المورد {id} غير موجودة لدفعة المطابقة.',
  },
  {
    code: 'BANK_ACCOUNT_FOREIGN_CURRENCY',
    en: 'Bank account currency {currency} differs from the base currency {baseCurrency}; foreign-currency transactions cannot be posted yet',
    ar: 'عملة الحساب البنكي {currency} تختلف عن العملة الأساسية {baseCurrency}؛ لا يمكن ترحيل عمليات بعملات أجنبية حاليًا.',
  },
  {
    code: 'CURRENCY_PAIR_SAME',
    en: 'From and To currencies cannot be the same',
    ar: 'لا يمكن أن تكون عملة المصدر وعملة الهدف متماثلتين.',
  },
  { code: 'EXCHANGE_RATE_NOT_FOUND', en: 'Exchange rate not found', ar: 'سعر الصرف غير موجود.' },
  {
    code: 'EXCHANGE_RATE_NOT_FOUND_FOR_DATE',
    en: 'Exchange rate not found for {from} to {to} on {date}',
    ar: 'لا يوجد سعر صرف من {from} إلى {to} بتاريخ {date}.',
  },
  {
    code: 'EXCHANGE_RATE_NOT_FOUND_BEFORE_DATE',
    en: 'No exchange rate found for {from} to {to} on or before {date}',
    ar: 'لا يوجد سعر صرف من {from} إلى {to} بتاريخ {date} أو قبله.',
  },
];

/** Items, warehouses, stock moves, price lists, BOMs and work orders. */
const INVENTORY_ERRORS: ErrorCatalogEntry[] = [
  { code: 'ITEM_NOT_FOUND', en: 'Item not found', ar: 'الصنف غير موجود.' },
  {
    code: 'COMPOSITE_COMPONENT_DUPLICATE',
    en: 'Each item can appear only once in a composite item',
    ar: 'لا يمكن تكرار الصنف نفسه داخل الصنف المركّب.',
  },
  { code: 'ITEM_ID_NOT_FOUND', en: 'Item {id} not found', ar: 'الصنف {id} غير موجود.' },
  {
    code: 'ITEM_NOT_FOUND_BY_SKU',
    en: 'Item not found with SKU: {sku}',
    ar: 'لا يوجد صنف برمز الصنف (SKU): {sku}',
  },
  {
    code: 'COMPONENT_ITEM_NOT_FOUND',
    en: 'Component item {id} not found',
    ar: 'الصنف المكوّن {id} غير موجود.',
  },
  { code: 'WAREHOUSE_NOT_FOUND', en: 'Warehouse not found', ar: 'المستودع غير موجود.' },
  {
    code: 'WAREHOUSE_ID_NOT_FOUND',
    en: 'Warehouse {id} not found',
    ar: 'المستودع {id} غير موجود.',
  },
  { code: 'SKU_EXISTS', en: 'SKU already exists', ar: 'رمز الصنف (SKU) مستخدم مسبقًا.' },
  {
    code: 'COMPOSITE_SKU_EXISTS',
    en: 'SKU already exists for a composite item',
    ar: 'رمز الصنف (SKU) مستخدم مسبقًا لصنف مركّب.',
  },
  {
    code: 'COMPOSITE_ITEM_NOT_FOUND',
    en: 'Composite item not found',
    ar: 'الصنف المركّب غير موجود.',
  },
  {
    code: 'BUNDLE_COMPONENTS_INSUFFICIENT',
    en: 'Insufficient component stock to assemble bundle',
    ar: 'مخزون المكوّنات غير كافٍ لتجميع الصنف المركّب.',
  },
  {
    code: 'ITEM_OPENING_STOCK_NOT_ALLOWED',
    en: 'Opening stock cannot be set when creating an item; create the item, then record an inventory adjustment so the stock is posted to the ledger',
    ar: 'لا يمكن إدخال رصيد افتتاحي للمخزون عند إنشاء الصنف؛ أنشئ الصنف ثم سجّل تسوية مخزون لتُرحَّل الكمية إلى دفتر الأستاذ.',
  },
  { code: 'ITEM_HAS_TRANSACTIONS', en: 'Item has transactions', ar: 'توجد حركات على هذا الصنف.' },
  {
    code: 'ITEM_NOT_TRACKED',
    en: '{item} is not an inventory-tracked item',
    ar: 'الصنف {item} لا يُتتبَّع في المخزون.',
  },
  {
    code: 'ITEM_NO_INVENTORY_ACCOUNT',
    en: '{item} has no inventory account; assign one before adjusting its stock',
    ar: 'الصنف {item} ليس له حساب مخزون؛ حدّد حسابًا قبل تسوية مخزونه.',
  },
  {
    code: 'ITEM_NO_COST_PRICE',
    en: '{item} has no cost price; set one so the adjustment can be valued',
    ar: 'الصنف {item} ليس له سعر تكلفة؛ أدخِل سعر التكلفة لتقييم التسوية.',
  },
  {
    code: 'QUANTITY_NOT_WHOLE',
    en: 'Quantity {quantity} of a stock-tracked item must be a whole number of units',
    ar: 'يجب أن تكون الكمية {quantity} لصنف مخزني عددًا صحيحًا من الوحدات.',
  },
  {
    code: 'INSUFFICIENT_INVENTORY',
    en: 'Insufficient inventory. Required: {required}, Available: {available}',
    ar: 'المخزون غير كافٍ. المطلوب: {required}، المتاح: {available}',
  },
  {
    code: 'INSUFFICIENT_STOCK_IN_WAREHOUSE',
    en: 'Insufficient stock for {item} in this warehouse',
    ar: 'المخزون غير كافٍ للصنف {item} في هذا المستودع.',
  },
  {
    code: 'INSUFFICIENT_STOCK',
    en: 'Insufficient stock for {item}',
    ar: 'المخزون غير كافٍ للصنف {item}.',
  },
  {
    code: 'INSUFFICIENT_STOCK_FOR_ITEM',
    en: 'Insufficient stock for item {item}. Available: {available}, Required: {required}',
    ar: 'المخزون غير كافٍ للصنف {item}. المتاح: {available}، المطلوب: {required}',
  },
  {
    code: 'INSUFFICIENT_STOCK_IN_SOURCE',
    en: 'Insufficient stock for "{item}" in source warehouse. Available: {available}, Requested: {requested}',
    ar: 'المخزون غير كافٍ للصنف "{item}" في المستودع المصدر. المتاح: {available}، المطلوب: {requested}',
  },
  {
    code: 'ADJUSTMENT_STOCK_USED_IN_WAREHOUSE',
    en: 'Cannot void: the stock added by this adjustment has since been used for {item} in this warehouse',
    ar: 'لا يمكن الإلغاء: الكمية التي أضافتها هذه التسوية للصنف {item} استُخدمت بعد ذلك في هذا المستودع.',
  },
  {
    code: 'ADJUSTMENT_STOCK_USED',
    en: 'Cannot void: the stock added by this adjustment has since been used for {item}',
    ar: 'لا يمكن الإلغاء: الكمية التي أضافتها هذه التسوية للصنف {item} استُخدمت بعد ذلك.',
  },
  {
    code: 'ADJUSTMENT_DATE_INVALID',
    en: 'Invalid adjustment date',
    ar: 'تاريخ التسوية غير صالح.',
  },
  {
    code: 'ADJUSTMENT_ACCOUNT_INVALID',
    en: 'Adjustment account must be an active expense account',
    ar: 'يجب أن يكون حساب التسوية حساب مصروفات نشطًا.',
  },
  {
    code: 'ADJUSTMENT_ACCOUNT_SAME',
    en: 'The adjustment account must differ from the item inventory account',
    ar: 'يجب أن يختلف حساب التسوية عن حساب المخزون للصنف.',
  },
  { code: 'ADJUSTMENT_NOT_FOUND', en: 'Adjustment not found', ar: 'تسوية المخزون غير موجودة.' },
  {
    code: 'ADJUSTMENT_NO_LEDGER',
    en: 'This adjustment has no linked ledger entry; correct it with a new adjustment instead',
    ar: 'هذه التسوية ليس لها قيد مرتبط في دفتر الأستاذ؛ صحّحها بتسوية جديدة بدلًا من ذلك.',
  },
  {
    code: 'ADJUSTMENT_ALREADY_VOIDED',
    en: 'Adjustment has already been voided',
    ar: 'تم إلغاء هذه التسوية مسبقًا.',
  },
  {
    code: 'PRICE_LIST_DUPLICATE_ITEM',
    en: 'Each item can appear only once in a price list',
    ar: 'لا يجوز تكرار الصنف نفسه في قائمة الأسعار.',
  },
  { code: 'PRICE_LIST_NOT_FOUND', en: 'Price list not found', ar: 'قائمة الأسعار غير موجودة.' },
  {
    code: 'TRANSFER_SAME_WAREHOUSE',
    en: 'Source and destination warehouses must be different',
    ar: 'يجب أن يختلف المستودع المصدر عن المستودع الوجهة.',
  },
  {
    code: 'SOURCE_WAREHOUSE_NOT_FOUND',
    en: 'Source warehouse not found',
    ar: 'المستودع المصدر غير موجود.',
  },
  {
    code: 'DESTINATION_WAREHOUSE_NOT_FOUND',
    en: 'Destination warehouse not found',
    ar: 'المستودع الوجهة غير موجود.',
  },
  { code: 'TRANSFER_NOT_FOUND', en: 'Transfer not found', ar: 'التحويل المخزني غير موجود.' },
  {
    code: 'TRANSFER_NOT_PENDING',
    en: 'Only pending transfers can be marked as in-transit',
    ar: 'يمكن نقل التحويلات المعلّقة فقط إلى حالة "قيد النقل".',
  },
  {
    code: 'TRANSFER_COMPLETE_STATE',
    en: 'Only pending or in-transit transfers can be completed',
    ar: 'يمكن إكمال التحويلات المعلّقة أو قيد النقل فقط.',
  },
  {
    code: 'TRANSFER_CANCEL_STATE',
    en: 'Only pending or in-transit transfers can be cancelled',
    ar: 'يمكن إلغاء التحويلات المعلّقة أو قيد النقل فقط.',
  },
  { code: 'WAREHOUSE_CODE_EXISTS', en: 'Warehouse code exists', ar: 'رمز المستودع مستخدم مسبقًا.' },
  {
    code: 'WAREHOUSE_HAS_MOVEMENTS',
    en: 'Warehouse has movements',
    ar: 'توجد حركات مخزنية على هذا المستودع.',
  },
  {
    code: 'DEFAULT_WAREHOUSE_MISSING',
    en: 'No default warehouse found',
    ar: 'لا يوجد مستودع افتراضي.',
  },
  {
    code: 'BOM_CYCLE_DETECTED',
    en: 'Circular reference detected in BOM structure',
    ar: 'يوجد تكرار دائري في قائمة المواد: لا يمكن أن يدخل صنف في تركيب نفسه.',
  },
  { code: 'OUTPUT_ITEM_NOT_FOUND', en: 'Output item not found', ar: 'الصنف المُنتَج غير موجود.' },
  {
    code: 'BOM_ACTIVE_EXISTS',
    en: 'An active BOM already exists for this item',
    ar: 'توجد قائمة مواد نشطة لهذا الصنف مسبقًا.',
  },
  {
    code: 'BOM_SELF_COMPONENT',
    en: 'Output item cannot be a component of itself',
    ar: 'لا يمكن أن يكون الصنف المُنتَج مكوّنًا لنفسه.',
  },
  { code: 'BOM_NOT_FOUND', en: 'BOM not found', ar: 'قائمة المواد غير موجودة.' },
  {
    code: 'BOM_HAS_WORK_ORDERS',
    en: 'Cannot delete BOM with existing work orders',
    ar: 'لا يمكن حذف قائمة مواد مرتبطة بأوامر عمل.',
  },
  { code: 'WORK_ORDER_NOT_FOUND', en: 'Work order not found', ar: 'أمر العمل غير موجود.' },
  {
    code: 'WORK_ORDER_CLOSED',
    en: 'Cannot update completed or cancelled work order',
    ar: 'لا يمكن تعديل أمر عمل مكتمل أو ملغى.',
  },
  {
    code: 'WORK_ORDER_CANNOT_START',
    en: 'Work order cannot be started',
    ar: 'لا يمكن بدء أمر العمل.',
  },
  {
    code: 'MATERIALS_INSUFFICIENT',
    en: 'Insufficient materials. Check material requirements.',
    ar: 'المواد غير كافية. راجِع احتياجات المواد.',
  },
  {
    code: 'WORK_ORDER_NOT_IN_PROCESS',
    en: 'Work order is not in process',
    ar: 'أمر العمل ليس قيد التنفيذ.',
  },
  {
    code: 'WORK_ORDER_CANCEL_COMPLETED',
    en: 'Cannot cancel completed work order',
    ar: 'لا يمكن إلغاء أمر عمل مكتمل.',
  },
  {
    code: 'WORK_ORDER_DELETE_STATE',
    en: 'Only draft work orders can be deleted',
    ar: 'يمكن حذف أوامر العمل في حالة المسودة فقط.',
  },
];

/** Employees, attendance and payroll. */
const HR_ERRORS: ErrorCatalogEntry[] = [
  { code: 'EMPLOYEE_NOT_FOUND', en: 'Employee not found', ar: 'الموظف غير موجود.' },
  {
    code: 'EMPLOYEE_NOT_ACTIVE',
    en: 'Employee {employeeId} is not active',
    ar: 'الموظف {employeeId} غير نشط.',
  },
  {
    code: 'EMPLOYEE_ID_EXISTS',
    en: 'Employee ID already exists',
    ar: 'الرقم الوظيفي مستخدم مسبقًا.',
  },
  {
    code: 'EMPLOYEE_HAS_PAYROLL',
    en: 'Cannot delete employee with payroll history',
    ar: 'لا يمكن حذف موظف له سجل رواتب.',
  },
  {
    code: 'EMPLOYEE_EMAIL_MISSING',
    en: 'Employee does not have an email address',
    ar: 'لا يوجد بريد إلكتروني لهذا الموظف.',
  },
  {
    code: 'ALREADY_CLOCKED_IN',
    en: 'Already clocked in today',
    ar: 'تم تسجيل الحضور اليوم مسبقًا.',
  },
  {
    code: 'CLOCK_IN_NOT_FOUND',
    en: 'No clock-in record found for today',
    ar: 'لا يوجد تسجيل حضور لليوم.',
  },
  {
    code: 'ATTENDANCE_EXISTS',
    en: 'Attendance already recorded for this date',
    ar: 'تم تسجيل الحضور لهذا التاريخ مسبقًا.',
  },
  {
    code: 'ATTENDANCE_PERIOD_INVALID',
    en: 'Provide month (1-12) and year together, or startDate/endDate',
    ar: 'حدّد الشهر (1-12) والسنة معًا، أو تاريخ البداية وتاريخ النهاية.',
  },
  {
    code: 'ATTENDANCE_NOT_FOUND',
    en: 'Attendance record not found',
    ar: 'سجل الحضور غير موجود.',
  },
  { code: 'PAYROLL_RUN_NOT_FOUND', en: 'Payroll run not found', ar: 'مسير الرواتب غير موجود.' },
  {
    code: 'PAYROLL_RUN_EXISTS',
    en: 'Payroll run already exists for this period',
    ar: 'يوجد مسير رواتب لهذه الفترة مسبقًا.',
  },
  {
    code: 'PAYROLL_ALREADY_PROCESSED',
    en: 'Payroll already processed',
    ar: 'تمت معالجة الرواتب مسبقًا.',
  },
  {
    code: 'PAYROLL_PERIOD_ALREADY_PROCESSED',
    en: 'Payroll for period {period} has already been processed',
    ar: 'تمت معالجة رواتب الفترة {period} مسبقًا.',
  },
  {
    code: 'PAYROLL_NOT_PROCESSED',
    en: 'Payroll must be processed before marking as paid',
    ar: 'يجب معالجة الرواتب قبل تسجيلها كمدفوعة.',
  },
  {
    code: 'PAYROLL_ACCOUNTS_MISSING',
    en: 'Salary expense and cash/bank accounts must be configured before marking payroll as paid',
    ar: 'يجب تحديد حساب مصروف الرواتب وحساب النقدية أو البنك قبل تسجيل الرواتب كمدفوعة.',
  },
  {
    code: 'PAYROLL_PAID_UNDELETABLE',
    en: 'Cannot delete paid payroll',
    ar: 'لا يمكن حذف رواتب مدفوعة.',
  },
  { code: 'PAYSLIP_NOT_FOUND', en: 'Payslip not found', ar: 'قسيمة الراتب غير موجودة.' },
  {
    code: 'PAYSLIP_ORGANIZATION_REQUIRED',
    en: 'organizationId is required to send a payslip',
    ar: 'يجب تحديد المنشأة لإرسال قسيمة الراتب.',
  },
  {
    code: 'PAYSLIP_PDF_TIMEOUT',
    en: 'Payslip PDF generation timed out',
    ar: 'استغرق إنشاء ملف PDF لقسيمة الراتب وقتًا أطول من المسموح به. حاول مرة أخرى.',
  },
];

/** Projects, tasks, timesheets and CRM. */
const PROJECTS_CRM_ERRORS: ErrorCatalogEntry[] = [
  { code: 'PROJECT_NOT_FOUND', en: 'Project not found', ar: 'المشروع غير موجود.' },
  {
    code: 'PROJECT_HAS_ENTRIES',
    en: 'Cannot delete project with timesheet entries or invoices',
    ar: 'لا يمكن حذف مشروع عليه سجلات وقت أو فواتير.',
  },
  {
    code: 'PROJECT_NO_CUSTOMER',
    en: 'Project has no customer assigned',
    ar: 'لم يتم ربط المشروع بعميل.',
  },
  {
    code: 'NO_UNBILLED_ENTRIES',
    en: 'No unbilled entries found for this period',
    ar: 'لا توجد سجلات وقت غير مفوترة في هذه الفترة.',
  },
  {
    code: 'ENTRIES_BILLED_MEANWHILE',
    en: 'Some time entries were billed meanwhile; try again',
    ar: 'تمت فوترة بعض سجلات الوقت في الأثناء؛ حاول مرة أخرى.',
  },
  { code: 'TASK_NOT_FOUND', en: 'Task not found', ar: 'المهمة غير موجودة.' },
  {
    code: 'TASK_HAS_ENTRIES',
    en: 'Cannot delete task with timesheet entries',
    ar: 'لا يمكن حذف مهمة عليها سجلات وقت.',
  },
  {
    code: 'TIMER_RUNNING',
    en: 'A timer is already running. Stop it first.',
    ar: 'يوجد مؤقّت قيد التشغيل. أوقفه أولًا.',
  },
  { code: 'TIMER_NOT_FOUND', en: 'Running timer not found', ar: 'لا يوجد مؤقّت قيد التشغيل.' },
  {
    code: 'TIMESHEET_ENTRY_NOT_FOUND',
    en: 'Timesheet entry not found',
    ar: 'سجل الوقت غير موجود.',
  },
  {
    code: 'TIMESHEET_BILLED_UPDATE',
    en: 'Cannot update billed timesheet entry',
    ar: 'لا يمكن تعديل سجل وقت تمت فوترته.',
  },
  {
    code: 'TIMESHEET_BILLED_DELETE',
    en: 'Cannot delete billed timesheet entry',
    ar: 'لا يمكن حذف سجل وقت تمت فوترته.',
  },
  {
    code: 'CRM_LEAD_OR_DEAL_REQUIRED',
    en: 'Either leadId or dealId must be provided',
    ar: 'يجب تحديد عميل محتمل أو صفقة.',
  },
  { code: 'LEAD_NOT_FOUND', en: 'Lead not found', ar: 'العميل المحتمل غير موجود.' },
  { code: 'DEAL_NOT_FOUND', en: 'Deal not found', ar: 'الصفقة غير موجودة.' },
  { code: 'ACTIVITY_NOT_FOUND', en: 'Activity not found', ar: 'النشاط غير موجود.' },
  { code: 'DEAL_ALREADY_WON', en: 'Deal is already won', ar: 'تم كسب الصفقة مسبقًا.' },
  {
    code: 'DEAL_LOST_CANNOT_WIN',
    en: 'Cannot mark a lost deal as won',
    ar: 'لا يمكن تحويل صفقة خاسرة إلى رابحة.',
  },
  {
    code: 'DEAL_ALREADY_LOST',
    en: 'Deal is already lost',
    ar: 'تم تسجيل الصفقة كخاسرة مسبقًا.',
  },
  {
    code: 'DEAL_WON_CANNOT_LOSE',
    en: 'Cannot mark a won deal as lost',
    ar: 'لا يمكن تحويل صفقة رابحة إلى خاسرة.',
  },
  {
    code: 'DEAL_CLOSED',
    en: 'Cannot change stage of closed deal',
    ar: 'لا يمكن تغيير مرحلة صفقة مغلقة.',
  },
  {
    code: 'LEAD_ALREADY_CONVERTED',
    en: 'Lead has already been converted',
    ar: 'تم تحويل العميل المحتمل مسبقًا.',
  },
];

/** VAT returns, tax rates and VAT settings. */
const TAX_ERRORS: ErrorCatalogEntry[] = [
  { code: 'TAX_RATE_NOT_FOUND', en: 'Tax rate not found', ar: 'نسبة الضريبة غير موجودة.' },
  {
    code: 'TAX_RATE_NOT_CONFIGURED',
    en: 'Tax rate {taxCode} is not configured',
    ar: 'نسبة الضريبة {taxCode} غير مُعدّة.',
  },
  {
    code: 'TAX_RATE_NAME_EXISTS',
    en: 'Tax rate with this name already exists',
    ar: 'توجد نسبة ضريبة بهذا الاسم مسبقًا.',
  },
  {
    code: 'TAX_RATE_IN_USE',
    en: 'Tax rate is in use and cannot be deleted',
    ar: 'نسبة الضريبة مستخدمة ولا يمكن حذفها.',
  },
  {
    code: 'VAT_RETURN_EXISTS',
    en: 'VAT return for this period already exists',
    ar: 'يوجد إقرار ضريبة قيمة مضافة لهذه الفترة مسبقًا.',
  },
  {
    code: 'VAT_RETURN_OVERLAPS',
    en: 'The period overlaps VAT return {reference}',
    ar: 'الفترة تتداخل مع الإقرار الضريبي {reference}.',
  },
  {
    code: 'VAT_RETURN_NOT_FOUND',
    en: 'VAT return not found',
    ar: 'إقرار ضريبة القيمة المضافة غير موجود.',
  },
  {
    code: 'VAT_RETURN_CALCULATE_STATE',
    en: 'Only draft or calculated VAT returns can be calculated',
    ar: 'يمكن احتساب الإقرارات الضريبية في حالة المسودة أو المحتسبة فقط.',
  },
  {
    code: 'VAT_RETURN_CALC_CONCURRENT',
    en: 'VAT return changed while it was being calculated',
    ar: 'تغيّر الإقرار الضريبي أثناء احتسابه. حاول مرة أخرى.',
  },
  {
    code: 'VAT_RETURN_NOT_CALCULATED',
    en: 'VAT return must be calculated before submission',
    ar: 'يجب احتساب الإقرار الضريبي قبل تقديمه.',
  },
  {
    code: 'VAT_RETURN_ALREADY_SUBMITTED',
    en: 'VAT return has already been submitted',
    ar: 'تم تقديم الإقرار الضريبي مسبقًا.',
  },
  {
    code: 'VAT_LEDGER_CHANGED',
    en: 'VAT in the ledger changed since this return was calculated; recalculate it before submitting',
    ar: 'تغيّرت أرصدة ضريبة القيمة المضافة في دفتر الأستاذ منذ احتساب هذا الإقرار؛ أعد احتسابه قبل التقديم.',
  },
  {
    code: 'VAT_PAYMENT_EXISTS',
    en: 'Payment already recorded for this VAT return',
    ar: 'تم تسجيل دفعة لهذا الإقرار الضريبي مسبقًا.',
  },
  {
    code: 'VAT_RETURN_NOT_SUBMITTED',
    en: 'VAT return must be submitted before recording payment',
    ar: 'يجب تقديم الإقرار الضريبي قبل تسجيل الدفعة.',
  },
  {
    code: 'VAT_RETURN_NOTHING_PAYABLE',
    en: 'This VAT return has no VAT payable to pay',
    ar: 'لا توجد ضريبة مستحقة الدفع في هذا الإقرار.',
  },
  {
    code: 'VAT_PAYMENT_NOT_EXACT',
    en: 'Payment {amount} must equal the VAT payable of {payable} exactly; partial payments are not supported',
    ar: 'يجب أن يساوي مبلغ الدفعة {amount} الضريبة المستحقة {payable} تمامًا؛ السداد الجزئي غير مدعوم.',
  },
  {
    code: 'VAT_SETTLEMENT_MISSING',
    en: 'The settlement journal of this VAT return was not found; it cannot be paid',
    ar: 'لم يتم العثور على قيد تسوية هذا الإقرار الضريبي؛ لا يمكن سداده.',
  },
  {
    code: 'VAT_PAID_FROM_INVALID',
    en: 'Paid-from account must be an active bank or cash account of this organization in the base currency',
    ar: 'يجب أن يكون حساب الدفع حسابًا بنكيًا أو نقديًا نشطًا في هذه المنشأة وبالعملة الأساسية.',
  },
  {
    code: 'VAT_PAID_FROM_SAME',
    en: 'Paid-from account must differ from the VAT Payable account',
    ar: 'يجب أن يختلف حساب الدفع عن حساب ضريبة القيمة المضافة المستحقة.',
  },
  {
    code: 'VAT_RETURN_ALREADY_PAID',
    en: 'VAT return has already been paid',
    ar: 'تم سداد الإقرار الضريبي مسبقًا.',
  },
  {
    code: 'VAT_RETURN_FILE_NOT_SUBMITTED',
    en: 'Only a submitted VAT return can be marked as filed',
    ar: 'لا يمكن تسجيل الإقرار الضريبي كمُودَع لدى الجهة الضريبية إلا بعد تقديمه.',
  },
  {
    code: 'VAT_RETURN_FILE_HAS_PAYABLE',
    en: 'This VAT return has VAT payable; record its payment to file it',
    ar: 'على هذا الإقرار ضريبة مستحقة الدفع؛ سجّل سدادها لإتمام إيداعه.',
  },
  {
    code: 'VAT_RETURN_DELETE_STATE',
    en: 'Only draft or calculated VAT returns can be deleted',
    ar: 'يمكن حذف الإقرارات الضريبية في حالة المسودة أو المحتسبة فقط.',
  },
  {
    code: 'VAT_PAYABLE_REQUIRED_RETURNS',
    en: 'Please configure the default VAT Payable account in organization settings before working with VAT returns',
    ar: 'حدّد حساب ضريبة القيمة المضافة المستحقة الافتراضي في إعدادات المنشأة قبل العمل على الإقرارات الضريبية.',
  },
  {
    code: 'VAT_RECEIVABLE_REQUIRED_RETURNS',
    en: 'Please configure the default VAT Receivable account in organization settings before working with VAT returns',
    ar: 'حدّد حساب ضريبة القيمة المضافة القابلة للاسترداد الافتراضي في إعدادات المنشأة قبل العمل على الإقرارات الضريبية.',
  },
  {
    code: 'VAT_ACCOUNTS_SAME',
    en: 'The VAT Payable and VAT Receivable accounts must be different accounts',
    ar: 'يجب أن يكون حساب ضريبة القيمة المضافة المستحقة مختلفًا عن حساب ضريبة القيمة المضافة القابلة للاسترداد.',
  },
  {
    code: 'VAT_ACCOUNTS_MISSING',
    en: 'The configured VAT Payable/Receivable accounts no longer exist; review organization settings',
    ar: 'حسابات ضريبة القيمة المضافة المحددة في الإعدادات لم تعد موجودة؛ راجِع إعدادات المنشأة.',
  },
];

/** Document intake, AI settings, notifications, organization settings. */
const INTAKE_SETTINGS_ERRORS: ErrorCatalogEntry[] = [
  {
    code: 'INTAKE_JOB_NOT_FOUND',
    en: 'Intake job not found',
    ar: 'مهمة قراءة المستند غير موجودة.',
  },
  {
    code: 'INTAKE_QUEUE_FULL',
    en: 'Too many documents are waiting to be processed. Try again shortly.',
    ar: 'هناك مستندات كثيرة بانتظار المعالجة. حاول مرة أخرى بعد قليل.',
  },
  {
    code: 'INTAKE_RETRY_NOT_FAILED',
    en: 'Only failed intake jobs can be retried',
    ar: 'يمكن إعادة المحاولة فقط لمهام قراءة المستندات التي فشلت.',
  },
  {
    code: 'INTAKE_APPROVE_STATE',
    en: 'This intake job cannot be approved in its current state',
    ar: 'لا يمكن اعتماد مهمة قراءة المستند هذه في حالتها الحالية.',
  },
  {
    code: 'INTAKE_CURRENCY_REQUIRED',
    en: 'The currency could not be read from the document; choose the currency before approving',
    ar: 'تعذّرت قراءة العملة من المستند. اختر العملة قبل الاعتماد.',
  },
  {
    code: 'INTAKE_TYPE_INVALID',
    en: 'type must be BILL or INVOICE',
    ar: 'يجب أن يكون نوع المستند فاتورة مورد أو فاتورة مبيعات.',
  },
  {
    code: 'CALLBACK_URL_INVALID',
    en: 'callbackUrl is not a valid URL',
    ar: 'رابط العودة غير صالح.',
  },
  {
    code: 'CALLBACK_URL_NOT_ALLOWED',
    en: 'callbackUrl must be the AI settings page of this app',
    ar: 'يجب أن يكون رابط العودة صفحة إعدادات الذكاء الاصطناعي في هذا التطبيق.',
  },
  { code: 'NOTIFICATION_NOT_FOUND', en: 'Notification not found', ar: 'الإشعار غير موجود.' },
  { code: 'LOGO_REQUIRED', en: 'Logo file is required', ar: 'يجب اختيار ملف الشعار.' },
  {
    code: 'LOGO_TYPE_NOT_ALLOWED',
    en: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP',
    ar: 'نوع الملف غير مسموح به. الأنواع المسموح بها: JPEG وPNG وGIF وWebP.',
  },
  {
    code: 'LOGO_TOO_LARGE',
    en: 'File too large. Maximum size: 2MB',
    ar: 'حجم الملف كبير جدًا. الحد الأقصى 2 ميجابايت.',
  },
  {
    code: 'BULK_JOB_NOT_FOUND',
    en: 'Bulk operation job {id} not found',
    ar: 'العملية الجماعية {id} غير موجودة.',
  },
];

/** Connecting the owner's AI app (MCP connection and its consent screen). */
const AI_APP_CONNECTION_ERRORS: ErrorCatalogEntry[] = [
  {
    code: 'AI_APP_CONNECTION_NOT_CONFIGURED',
    en: 'MCP is not configured',
    ar: 'ربط تطبيقات الذكاء الاصطناعي غير مفعّل على هذا الخادم.',
  },
  {
    code: 'AI_APP_REQUEST_NOT_FOUND',
    en: 'This connection request was not found or was already answered',
    ar: 'طلب الربط هذا غير موجود أو تم الرد عليه من قبل.',
  },
  {
    code: 'AI_APP_REQUEST_EXPIRED',
    en: 'This connection request expired',
    ar: 'انتهت صلاحية طلب الربط هذا.',
  },
  { code: 'AI_APP_REQUEST_MISSING', en: 'Request not found', ar: 'الطلب غير موجود.' },
  { code: 'AI_APP_CONNECTION_NOT_FOUND', en: 'Connection not found', ar: 'الربط غير موجود.' },
  {
    code: 'AI_APP_DISCONNECT_FORBIDDEN',
    en: 'Only its owner or a settings manager can disconnect this app',
    ar: 'لا يمكن إلغاء ربط هذا التطبيق إلا لصاحبه أو لمن يدير الإعدادات.',
  },
];

/** Import, export and the external integration connector. */
const IMPORT_INTEGRATION_ERRORS: ErrorCatalogEntry[] = [
  { code: 'ENTITY_TYPE_REQUIRED', en: 'Entity type is required', ar: 'يجب تحديد نوع البيانات.' },
  { code: 'ENTITY_TYPE_INVALID', en: 'Invalid entity type', ar: 'نوع البيانات غير صالح.' },
  { code: 'ENTITY_TYPE_UNSUPPORTED', en: 'Unsupported entityType', ar: 'نوع البيانات غير مدعوم.' },
  { code: 'EXPORT_FORMAT_INVALID', en: 'Invalid export format', ar: 'صيغة التصدير غير صالحة.' },
  {
    code: 'EXPORT_FORMAT_UNSUPPORTED',
    en: 'Unsupported export format',
    ar: 'صيغة التصدير غير مدعومة.',
  },
  { code: 'CONFIG_REQUIRED', en: 'Config is required', ar: 'يجب إدخال الإعدادات.' },
  { code: 'EXPORT_NO_DATA', en: 'No data to export', ar: 'لا توجد بيانات للتصدير.' },
  {
    code: 'EXPORT_TYPE_NOT_SUPPORTED',
    en: "Export for entity type '{type}' is not supported",
    ar: 'تصدير البيانات من نوع «{type}» غير مدعوم.',
  },
  {
    code: 'EXPORT_NOT_SUPPORTED',
    en: 'Export for {type} not supported',
    ar: 'تصدير {type} غير مدعوم.',
  },
  {
    code: 'IMPORT_NOT_IMPLEMENTED',
    en: 'Import for {type} not yet implemented',
    ar: 'استيراد {type} غير متاح حاليًا.',
  },
  {
    code: 'IMPORT_FORMAT_UNSUPPORTED',
    en: 'Unsupported file format. Please use CSV, Excel (.xlsx), or OFX/QFX',
    ar: 'صيغة الملف غير مدعومة. استخدم CSV أو Excel (.xlsx) أو OFX/QFX.',
  },
  { code: 'EXCEL_EMPTY', en: 'Excel file is empty', ar: 'ملف Excel فارغ.' },
  {
    code: 'IMPORT_OPENING_BALANCE_NOT_ALLOWED',
    en: 'openingBalance cannot be imported with accounts; enter opening balances in Accounting > Opening Balances so they are posted to the ledger',
    ar: 'لا يمكن استيراد الرصيد الافتتاحي مع الحسابات؛ أدخِل الأرصدة الافتتاحية من المحاسبة ← الأرصدة الافتتاحية لتُرحَّل إلى دفتر الأستاذ.',
  },
  {
    code: 'IMPORT_BANK_ACCOUNT_REQUIRED',
    en: 'Bank account ID or name is required for bank transaction import',
    ar: 'يجب تحديد الحساب البنكي (المعرّف أو الاسم) لاستيراد الحركات البنكية.',
  },
  {
    code: 'IMPORT_PAYMENT_INVOICE_REQUIRED',
    en: 'invoiceNumber is required: a payment must be allocated to an invoice',
    ar: 'رقم الفاتورة مطلوب: يجب تخصيص الدفعة لفاتورة.',
  },
  {
    code: 'IMPORT_PAYMENT_BILL_REQUIRED',
    en: 'billNumber is required: a payment must be allocated to a bill',
    ar: 'رقم فاتورة المورد مطلوب: يجب تخصيص الدفعة لفاتورة مورد.',
  },
  {
    code: 'IMPORT_TAX_AMOUNT_NOT_ACCEPTED',
    en: 'taxAmount is not accepted: provide taxRate (a percentage) and the VAT is computed',
    ar: 'لا يُقبل إدخال مبلغ الضريبة مباشرة: أدخِل نسبة الضريبة وسيُحسب مبلغ ضريبة القيمة المضافة تلقائيًا.',
  },
  {
    code: 'IMPORT_PAID_THROUGH_REQUIRED',
    en: 'paidThroughAccountCode is required (or configure a default bank account in organization settings)',
    ar: 'رمز حساب الدفع مطلوب (أو حدّد حسابًا بنكيًا افتراضيًا في إعدادات المنشأة).',
  },
  {
    code: 'INTEGRATION_KEY_MISSING',
    en: 'Missing or malformed integration API key',
    ar: 'مفتاح الربط مفقود أو غير صالح.',
  },
  {
    code: 'INTEGRATION_KEY_INVALID',
    en: 'Invalid, expired or revoked integration API key',
    ar: 'مفتاح الربط غير صالح أو منتهي الصلاحية أو ملغى.',
  },
  {
    code: 'INTEGRATION_KEY_OWNER_INACTIVE',
    en: 'The user who created this key is no longer active',
    ar: 'المستخدم الذي أنشأ هذا المفتاح لم يعد نشطًا.',
  },
  {
    code: 'INTEGRATION_RATE_LIMITED',
    en: 'Rate limit exceeded for this API key',
    ar: 'تم تجاوز عدد الطلبات المسموح به لهذا المفتاح. حاول مرة أخرى بعد قليل.',
  },
  { code: 'INTEGRATION_KEY_NOT_FOUND', en: 'API key not found', ar: 'مفتاح الربط غير موجود.' },
  {
    code: 'INTEGRATION_SCOPE_MISSING',
    en: 'Missing scope: {scope}',
    ar: 'المفتاح لا يملك الصلاحية المطلوبة: {scope}',
  },
  {
    code: 'INTEGRATION_ROLE_LACKS_SCOPE',
    en: 'Your role lacks {permission}, required for scope {scope}',
    ar: 'دورك لا يملك الصلاحية {permission} المطلوبة للنطاق {scope}.',
  },
  {
    code: 'INTEGRATION_KEYS_LIMIT',
    en: 'At most {max} active keys; revoke one first',
    ar: 'الحد الأقصى {max} مفاتيح نشطة؛ ألغِ أحدها أولًا.',
  },
  {
    code: 'INTEGRATION_ENDPOINTS_LIMIT',
    en: 'At most {max} webhook endpoints',
    ar: 'الحد الأقصى {max} من عناوين استقبال الإشعارات.',
  },
  {
    code: 'EXPIRES_AT_PAST',
    en: 'expiresAt must be in the future',
    ar: 'يجب أن يكون تاريخ انتهاء الصلاحية في المستقبل.',
  },
  {
    code: 'IDEMPOTENCY_KEY_INVALID',
    en: 'Idempotency-Key must be 1-200 printable ASCII characters',
    ar: 'يجب أن يتكون مفتاح منع التكرار من 1 إلى 200 حرف إنجليزي قابل للطباعة.',
  },
  {
    code: 'IDEMPOTENCY_KEY_RACE',
    en: 'Idempotency-Key is being reused; retry',
    ar: 'مفتاح منع التكرار قيد الاستخدام؛ أعد المحاولة.',
  },
  {
    code: 'IDEMPOTENCY_KEY_MISMATCH',
    en: 'Idempotency-Key was already used with a different request',
    ar: 'استُخدم مفتاح منع التكرار مسبقًا مع طلب مختلف.',
  },
  {
    code: 'IDEMPOTENCY_IN_PROGRESS',
    en: 'A request with this Idempotency-Key is still in progress',
    ar: 'ما زال طلب بمفتاح منع التكرار نفسه قيد التنفيذ.',
  },
  {
    code: 'ENDPOINT_NOT_SUBSCRIBED_OVERDUE',
    en: 'The endpoint does not subscribe to invoice.overdue',
    ar: 'هذا العنوان غير مشترك في إشعارات الفواتير المتأخرة.',
  },
  {
    code: 'WEBHOOK_ENDPOINT_INACTIVE',
    en: 'Enable the endpoint before sending the overdue backlog',
    ar: 'فعّل عنوان استقبال الإشعارات قبل إرسال الفواتير المتأخرة السابقة.',
  },
  {
    code: 'ENDPOINT_TEST_INACTIVE',
    en: 'Enable the endpoint before testing it',
    ar: 'فعّل عنوان استقبال الإشعارات قبل اختباره.',
  },
  { code: 'DELIVERY_NOT_FOUND', en: 'Delivery not found', ar: 'عملية الإرسال غير موجودة.' },
  { code: 'DELIVERY_IN_PROGRESS', en: 'Delivery is in progress', ar: 'عملية الإرسال جارية.' },
  {
    code: 'DELIVERY_CONCURRENT',
    en: 'Delivery changed concurrently',
    ar: 'تغيّرت عملية الإرسال في الوقت نفسه. حدّث الصفحة وحاول مرة أخرى.',
  },
  {
    code: 'WEBHOOK_ENDPOINT_NOT_FOUND',
    en: 'Webhook endpoint not found',
    ar: 'عنوان استقبال الإشعارات غير موجود.',
  },
  {
    code: 'WEBHOOK_URL_INVALID',
    en: 'Webhook URL is not a valid URL',
    ar: 'رابط استقبال الإشعارات غير صالح.',
  },
  {
    code: 'WEBHOOK_URL_NOT_HTTPS',
    en: 'Webhook URL must use https',
    ar: 'يجب أن يبدأ رابط استقبال الإشعارات بـ https.',
  },
  {
    code: 'WEBHOOK_URL_CREDENTIALS',
    en: 'Webhook URL must not contain credentials',
    ar: 'يجب ألا يحتوي رابط استقبال الإشعارات على اسم مستخدم أو كلمة مرور.',
  },
  {
    code: 'WEBHOOK_URL_PRIVATE',
    en: 'Webhook URL must be a public address',
    ar: 'يجب أن يكون رابط استقبال الإشعارات عنوانًا عامًا على الإنترنت.',
  },
  {
    code: 'WEBHOOK_HOST_UNRESOLVED',
    en: 'Webhook host does not resolve',
    ar: 'تعذّر الوصول إلى خادم رابط استقبال الإشعارات.',
  },
  {
    code: 'WEBHOOK_URL_RESOLVES_PRIVATE',
    en: 'Webhook URL must resolve to a public address',
    ar: 'يجب أن يشير رابط استقبال الإشعارات إلى عنوان عام على الإنترنت.',
  },
];

/** Every error entry, generic ones included. Codes are unique across the list. */
export const ERROR_CATALOG: readonly ErrorCatalogEntry[] = [
  ...GENERIC_ERRORS,
  ...FRAMEWORK_ERRORS,
  ...AUTH_ERRORS,
  ...COMMON_ERRORS,
  ...ACCOUNTING_ERRORS,
  ...SALES_ERRORS,
  ...PURCHASES_ERRORS,
  ...BANKING_ERRORS,
  ...INVENTORY_ERRORS,
  ...HR_ERRORS,
  ...PROJECTS_CRM_ERRORS,
  ...TAX_ERRORS,
  ...INTAKE_SETTINGS_ERRORS,
  ...IMPORT_INTEGRATION_ERRORS,
  ...AI_APP_CONNECTION_ERRORS,
];

/**
 * Per-field validation messages: the class-validator defaults the DTOs use and the repo's
 * custom decorator messages. "each value in X ..." messages reuse these with the property
 * rendered as "each item in X". Exact catalog entries (the password rules) are tried first.
 */
export const FIELD_MESSAGES: readonly FieldMessageEntry[] = [
  { en: 'property {property} should not exist', ar: 'الحقل {property} غير مسموح به.' },
  { en: '{property} should not be empty', ar: 'قيمة {property} مطلوبة.' },
  { en: '{property} should not be null or undefined', ar: 'قيمة {property} مطلوبة.' },
  { en: '{property} must be a string', ar: 'يجب أن تكون قيمة {property} نصًا.' },
  {
    en: '{property} must be an email',
    ar: 'يجب أن تكون قيمة {property} بريدًا إلكترونيًا صحيحًا.',
  },
  {
    en: '{property} must be one of the following values: {values}',
    ar: 'يجب أن تكون قيمة {property} إحدى القيم التالية: {values}',
  },
  { en: '{property} must be a number string', ar: 'يجب أن تكون قيمة {property} رقمًا.' },
  {
    en: '{property} must be a number conforming to the specified constraints',
    ar: 'يجب أن تكون قيمة {property} رقمًا صالحًا.',
  },
  { en: '{property} must be an integer number', ar: 'يجب أن تكون قيمة {property} عددًا صحيحًا.' },
  { en: '{property} must be a positive number', ar: 'يجب أن تكون قيمة {property} رقمًا موجبًا.' },
  { en: '{property} must be a boolean value', ar: 'يجب أن تكون قيمة {property} نعم أو لا.' },
  {
    en: '{property} must be a valid ISO 8601 date string',
    ar: 'يجب أن تكون قيمة {property} تاريخًا صحيحًا بالصيغة YYYY-MM-DD.',
  },
  { en: '{property} must be a Date instance', ar: 'يجب أن تكون قيمة {property} تاريخًا صحيحًا.' },
  { en: '{property} must be a UUID', ar: 'قيمة {property} ليست معرّفًا صالحًا.' },
  { en: '{property} must be a URL address', ar: 'يجب أن تكون قيمة {property} رابطًا صحيحًا.' },
  {
    en: '{property} must be a valid phone number',
    ar: 'يجب أن تكون قيمة {property} رقم هاتف صحيحًا.',
  },
  { en: '{property} must be an array', ar: 'يجب أن تكون قيمة {property} قائمة.' },
  { en: '{property} must be an object', ar: 'صيغة قيمة {property} غير صحيحة.' },
  {
    en: 'nested property {property} must be either object or array',
    ar: 'صيغة قيمة {property} غير صحيحة.',
  },
  {
    en: '{property} must match {pattern} regular expression',
    ar: 'صيغة قيمة {property} غير صحيحة.',
  },
  { en: '{property} must not be less than {min}', ar: 'يجب ألا تقل قيمة {property} عن {min}.' },
  {
    en: '{property} must not be greater than {max}',
    ar: 'يجب ألا تزيد قيمة {property} على {max}.',
  },
  {
    en: '{property} must be longer than or equal to {min} and shorter than or equal to {max} characters',
    ar: 'يجب أن يكون طول {property} بين {min} و{max} حرفًا.',
  },
  {
    en: '{property} must be longer than or equal to {min} characters',
    ar: 'يجب ألا يقل طول {property} عن {min} أحرف.',
  },
  {
    en: '{property} must be shorter than or equal to {max} characters',
    ar: 'يجب ألا يزيد طول {property} على {max} حرفًا.',
  },
  {
    en: '{property} must contain at least {min} elements',
    ar: 'يجب أن تحتوي {property} على {min} عنصر على الأقل.',
  },
  {
    en: '{property} must contain no more than {max} elements',
    ar: 'يجب ألا تحتوي {property} على أكثر من {max} عنصر.',
  },
  {
    en: '{property} must be equal to {value}',
    ar: 'يجب أن تكون قيمة {property} مساوية لـ {value}.',
  },
  {
    en: '{property} must be a non-negative decimal string with at most {integerDigits} integer digits and {fractionDigits} decimal places',
    ar: 'يجب أن تكون قيمة {property} رقمًا عشريًا غير سالب لا يزيد على {integerDigits} رقمًا صحيحًا و{fractionDigits} منازل عشرية.',
  },
  { en: '{property} must be a decimal string', ar: 'يجب أن تكون قيمة {property} رقمًا عشريًا.' },
  { en: '{property} must not contain spaces', ar: 'يجب ألا تحتوي قيمة {property} على مسافات.' },
];
