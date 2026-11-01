import { HttpStatus } from '@nestjs/common';
import { localizeError, localizeFieldMessage } from './localize-error';

describe('localizeError', () => {
  it('maps a framework default to its generic entry', () => {
    expect(
      localizeError({ message: 'Forbidden resource', status: HttpStatus.FORBIDDEN, locale: 'ar' }),
    ).toEqual({ code: 'FORBIDDEN', message: 'ليست لديك صلاحية للقيام بهذا الإجراء.' });
  });

  it('prefers the more specific pattern', () => {
    expect(
      localizeError({
        message: 'Insufficient stock for Widget in this warehouse',
        status: HttpStatus.BAD_REQUEST,
        locale: 'ar',
      }),
    ).toEqual({
      code: 'INSUFFICIENT_STOCK_IN_WAREHOUSE',
      message: 'المخزون غير كافٍ للصنف Widget في هذا المستودع.',
    });
  });

  it('names the bank account that already uses a ledger account, in Arabic (#663)', () => {
    expect(
      localizeError({
        message:
          'This ledger account is already linked to the bank account "Test Bank". Each bank account needs its own ledger account.',
        status: HttpStatus.CONFLICT,
        locale: 'ar',
      }),
    ).toEqual({
      code: 'BANK_LEDGER_ACCOUNT_TAKEN',
      message:
        'حساب دفتر الأستاذ هذا مرتبط بالفعل بالحساب البنكي "Test Bank". يحتاج كل حساب بنكي إلى حساب خاص به في دفتر الأستاذ.',
    });
  });

  it('answers an unknown route as not found', () => {
    expect(
      localizeError({ message: 'Cannot GET /nowhere', status: HttpStatus.NOT_FOUND, locale: 'ar' }),
    ).toEqual({ code: 'ROUTE_NOT_FOUND', message: 'الصفحة أو الخدمة المطلوبة غير موجودة.' });
  });

  it('uses a known code when its message text differs', () => {
    expect(
      localizeError({
        message: 'Some other wording',
        code: 'VALIDATION_ERROR',
        status: HttpStatus.BAD_REQUEST,
        locale: 'ar',
      }),
    ).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'بعض البيانات المدخلة غير صحيحة. راجِع الحقول المحددة.',
    });
  });

  it('derives a code from the status for an uncatalogued message', () => {
    expect(
      localizeError({ message: 'Teapot', status: HttpStatus.I_AM_A_TEAPOT, locale: 'en' }),
    ).toEqual({ code: 'I_AM_A_TEAPOT', message: 'Teapot' });
    expect(
      localizeError({ message: '', status: HttpStatus.BAD_GATEWAY, locale: 'ar' }).message,
    ).toBe('حدث خطأ غير متوقع. حاول مرة أخرى لاحقًا.');
  });
});

describe('localizeFieldMessage', () => {
  it('leaves English unchanged', () => {
    expect(localizeFieldMessage('name must be a string', 'en')).toBe('name must be a string');
  });

  it.each([
    ['name should not be empty', 'قيمة name مطلوبة.'],
    [
      'status must be one of the following values: DRAFT, SENT',
      'يجب أن تكون قيمة status إحدى القيم التالية: DRAFT, SENT',
    ],
    ['lines.0.quantity must be a number string', 'يجب أن تكون قيمة lines.0.quantity رقمًا.'],
    [
      'password must be longer than or equal to 8 characters',
      'يجب ألا يقل طول password عن 8 أحرف.',
    ],
    ['each value in tags must be a string', 'يجب أن تكون قيمة كل عنصر في tags نصًا.'],
    [
      'Password must contain at least one number',
      'يجب أن تحتوي كلمة المرور على رقم واحد على الأقل.',
    ],
    ['month must be YYYY-MM', 'يجب أن يكون الشهر بالصيغة YYYY-MM (مثل 2026-10).'],
    ['secret must not contain spaces', 'يجب ألا تحتوي قيمة secret على مسافات.'],
    ['weekStart is required', 'قيمة weekStart مطلوبة.'],
  ])('%s', (english, arabic) => {
    expect(localizeFieldMessage(english, 'ar')).toBe(arabic);
  });

  it('falls back to "the value of <field> is not valid"', () => {
    expect(localizeFieldMessage('Amount does something odd', 'ar')).toBe('قيمة Amount غير صالحة.');
  });
});
