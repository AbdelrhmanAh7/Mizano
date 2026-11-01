import { BRAND } from '@mizano/shared-types';
import { escapeHtml } from '../documents/templates/base.template';
import type { ResetLocale } from './dto/password.dto';

interface ResetMail {
  subject: string;
  html: string;
  text: string;
}

const COPY: Record<
  ResetLocale,
  {
    subject: string;
    greeting: (name: string) => string;
    body: (minutes: number) => string;
    button: string;
    ignore: string;
  }
> = {
  en: {
    subject: `Reset your ${BRAND.name.en} password`,
    greeting: (name) => `Hello ${name},`,
    body: (minutes) =>
      `We received a request to reset your ${BRAND.name.en} password. The link works once and expires in ${minutes} minutes.`,
    button: 'Choose a new password',
    ignore: 'If you did not ask for this, ignore this email: your password stays the same.',
  },
  ar: {
    subject: `إعادة تعيين كلمة المرور في ${BRAND.name.ar}`,
    greeting: (name) => `مرحبًا ${name}،`,
    body: (minutes) =>
      `وصلنا طلب لإعادة تعيين كلمة المرور لحسابك في ${BRAND.name.ar}. يعمل الرابط مرة واحدة وتنتهي صلاحيته بعد ${minutes} دقيقة.`,
    button: 'اختر كلمة مرور جديدة',
    ignore: 'إذا لم تطلب ذلك فتجاهل هذه الرسالة، وستبقى كلمة المرور كما هي.',
  },
};

/** The reset email in the language the person asked in (Arabic renders right-to-left). */
export function buildPasswordResetMail(
  locale: ResetLocale,
  name: string,
  link: string,
  minutes: number,
): ResetMail {
  const copy = COPY[locale];
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const html = `<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Tahoma, Arial, sans-serif; color: #111827; line-height: 1.6;">
  <p>${escapeHtml(copy.greeting(name))}</p>
  <p>${escapeHtml(copy.body(minutes))}</p>
  <p><a href="${escapeHtml(link)}" style="display: inline-block; padding: 10px 18px; background: #2563EB; color: #ffffff; text-decoration: none; border-radius: 6px;">${escapeHtml(copy.button)}</a></p>
  <p style="word-break: break-all; font-size: 12px; color: #6B7280;">${escapeHtml(link)}</p>
  <p style="font-size: 13px; color: #6B7280;">${escapeHtml(copy.ignore)}</p>
</body>
</html>`;
  const text = [copy.greeting(name), copy.body(minutes), link, copy.ignore].join('\n\n');
  return { subject: copy.subject, html, text };
}
