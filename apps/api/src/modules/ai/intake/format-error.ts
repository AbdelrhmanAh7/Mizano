/** Safe, localized repair messages: never include parser output or document data. */
const repairs = {
  TOO_LARGE: [
    'Document exceeds safe limits. Split it into smaller files.',
    'يتجاوز المستند الحدود الآمنة. قسّمه إلى ملفات أصغر.',
  ],
  ENCRYPTED: [
    'Remove the document password and upload it again.',
    'أزل كلمة مرور المستند ثم ارفعه مجدداً.',
  ],
  CORRUPT: [
    'Document is damaged or its type does not match. Export it again.',
    'المستند تالف أو نوعه غير مطابق. أعد تصديره.',
  ],
  UNSUPPORTED: ['Upload a PDF, DOCX or supported image.', 'ارفع ملف PDF أو DOCX أو صورة مدعومة.'],
  UNSUPPORTED_LEGACY_DOC: [
    'Save the file as DOCX or PDF and upload again.',
    'احفظ الملف بصيغة DOCX أو PDF ثم ارفعه مجدداً.',
  ],
  UNREADABLE: [
    'Text is unclear. Retake the whole page upright in good light, in focus, then upload it again.',
    'النص غير واضح. صوّر الصفحة كاملة بشكل مستقيم وبإضاءة جيدة وتركيز واضح، ثم ارفعها مجدداً.',
  ],
  TOOL_UNAVAILABLE: [
    'Document reader is unavailable. Ask the operator to install the CPU format tools.',
    'قارئ المستندات غير متاح. اطلب من المشغّل تثبيت أدوات القراءة على المعالج.',
  ],
  UNSUPPORTED_LANGUAGE: [
    'Select English, Arabic or both OCR languages and upload again.',
    'اختر الإنجليزية أو العربية أو كلتيهما للتعرف على النص ثم ارفع المستند مجدداً.',
  ],
  UNSUPPORTED_CONTENT: [
    'Document contains images or embedded objects. Export it as PDF and upload again.',
    'يحتوي المستند على صور أو عناصر مضمنة. صدّره بصيغة PDF ثم ارفعه مجدداً.',
  ],
} as const;

export type FormatErrorCode = keyof typeof repairs;

export class IntakeFormatError extends Error {
  constructor(readonly code: FormatErrorCode) {
    super(`INTAKE_${code}: ${repairs[code][0]} / ${repairs[code][1]}`);
    this.name = 'IntakeFormatError';
  }
}

export const MAX_INTAKE_BYTES = 20 * 1024 * 1024;
export const MAX_INTAKE_TEXT = 200_000;

export function checkTextLimit(text: string): string {
  if (text.length > MAX_INTAKE_TEXT) throw new IntakeFormatError('TOO_LARGE');
  return text;
}
