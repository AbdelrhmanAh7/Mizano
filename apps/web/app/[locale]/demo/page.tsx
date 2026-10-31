'use client';

import { useState, useRef, type FormEvent } from 'react';
import { useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { demoApi } from '@/lib/api';
import { CheckCircle2, AlertCircle } from 'lucide-react';

const COPY = {
  ar: {
    backHome: 'العودة للرئيسية',
    title: 'احجز عرضًا مدته 15 دقيقة',
    subtitle:
      'نريك كيف تتحول فاتورة المورّد إلى قيد مسودة يراجعه محاسبك ويوافق عليه. مجاني بالكامل خلال الفترة التجريبية.',
    name: 'الاسم',
    namePlaceholder: 'اسمك الكامل',
    contact: 'رقم الواتساب أو البريد الإلكتروني',
    contactHint: 'نتواصل معك عليه لتحديد الموعد المناسب',
    contactPlaceholder: 'مثال: 01001234567 أو name@company.com',
    role: 'صفتك',
    roleOwner: 'صاحب عمل',
    roleAccountant: 'محاسب / مكتب محاسبة',
    businessType: 'نوع النشاط',
    businessTypePlaceholder: 'مثال: عيادة، شركة خدمات، مقاولات...',
    preferredTime: 'الوقت المفضل للتواصل',
    preferredTimePlaceholder: 'مثال: غدًا بعد الظهر، أو يوم الأحد',
    message: 'ملاحظات إضافية (اختياري)',
    messagePlaceholder: 'أي أسئلة أو تفاصيل تود مشاركتها معنا',
    submit: 'إرسال طلب العرض',
    submitting: 'جاري الإرسال...',
    freeNote: 'مجاني خلال الفترة التجريبية · لا يُطلب أي دفع ولا بيانات بطاقة.',
    orRegister: 'أو جرّب مباشرة: ',
    registerLink: 'إنشاء حساب وتجربة النظام مجانًا',
    hasAccount: 'لديك حساب بالفعل؟ ',
    signIn: 'تسجيل الدخول',
    successTitle: 'تم استلام طلبك بنجاح',
    successBody:
      'شكرًا لك! سنتواصل معك عبر وسيلة الاتصال التي حددتها لتنسيق موعد العرض (15 دقيقة) والإجابة عن كل استفساراتك.',
    backToSite: 'العودة للموقع',
    errorRequired: 'يرجى كتابة الاسم ورقم الواتساب أو البريد الإلكتروني.',
    errorGeneric: 'تعذر إرسال الطلب حاليًا، يرجى المحاولة مرة أخرى.',
  },
  en: {
    backHome: 'Back to home',
    title: 'Book a 15-minute demo',
    subtitle:
      'See how a supplier bill becomes a draft entry reviewed and approved by your accountant. Free during the pilot.',
    name: 'Full Name',
    namePlaceholder: 'Your full name',
    contact: 'WhatsApp Number or Email',
    contactHint: 'We will contact you here to confirm a convenient time',
    contactPlaceholder: 'e.g. +20 100 123 4567 or name@company.com',
    role: 'Your Role',
    roleOwner: 'Business Owner',
    roleAccountant: 'Accountant / Accounting Firm',
    businessType: 'Business Type',
    businessTypePlaceholder: 'e.g. clinic, consulting, contracting...',
    preferredTime: 'Preferred Time to Connect',
    preferredTimePlaceholder: 'e.g. tomorrow afternoon, or Sunday morning',
    message: 'Additional Notes (Optional)',
    messagePlaceholder: 'Any specific questions or context you would like to share',
    submit: 'Request Demo',
    submitting: 'Sending...',
    freeNote: 'Free during the pilot · No payment or credit card required.',
    orRegister: 'Or try it yourself directly: ',
    registerLink: 'Sign up for the free pilot',
    hasAccount: 'Already have an account? ',
    signIn: 'Sign in',
    successTitle: 'Demo Request Received',
    successBody:
      'Thank you! We will reach out to you directly to arrange the 15-minute demo and answer all your questions.',
    backToSite: 'Back to site',
    errorRequired: 'Please provide your name and contact details.',
    errorGeneric: 'Could not send request right now. Please try again.',
  },
} as const;

export default function DemoPage() {
  const locale = useLocale();
  const c = locale === 'ar' ? COPY.ar : COPY.en;

  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [role, setRole] = useState<'owner' | 'accountant'>('owner');
  const [businessType, setBusinessType] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const trapRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim() || !contact.trim()) {
      setErrorMessage(c.errorRequired);
      return;
    }

    setIsLoading(true);
    try {
      await demoApi.submit({
        name: name.trim(),
        contact: contact.trim(),
        role,
        businessType: businessType.trim(),
        preferredTime: preferredTime.trim(),
        message: message.trim(),
        locale,
        website: trapRef.current?.value || '',
      });
      setIsSuccess(true);
    } catch {
      setErrorMessage(c.errorGeneric);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Header */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <Link href="/onboarding" className="flex items-center gap-2">
            <Image
              src="/svg/logo-full.svg"
              alt="Mizano"
              width={120}
              height={32}
              className="dark:hidden"
            />
            <Image
              src="/svg/logo-full-dark.svg"
              alt="Mizano"
              width={120}
              height={32}
              className="hidden dark:block"
            />
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Button variant="ghost" asChild>
              <Link href="/login">{c.signIn}</Link>
            </Button>
            <Button asChild>
              <Link href="/register">{c.registerLink}</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 container mx-auto px-4 py-12 flex items-center justify-center">
        <div className="w-full max-w-xl">
          {isSuccess ? (
            <Card className="text-center p-8">
              <CardContent className="pt-6 space-y-4">
                <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
                <h2 className="text-2xl font-bold">{c.successTitle}</h2>
                <p className="text-muted-foreground leading-relaxed">{c.successBody}</p>
                <div className="pt-4 flex items-center justify-center gap-4">
                  <Button asChild>
                    <Link href="/onboarding">{c.backToSite}</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href="/register">{c.registerLink}</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-lg">
              <CardHeader className="space-y-2">
                <CardTitle className="text-2xl font-bold tracking-tight">{c.title}</CardTitle>
                <CardDescription className="text-base leading-relaxed">
                  {c.subtitle}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-5">
                  {errorMessage && (
                    <div className="flex items-center gap-2 p-3 text-sm rounded-md bg-destructive/10 text-destructive">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="demo-name">{c.name}</Label>
                    <Input
                      id="demo-name"
                      required
                      maxLength={120}
                      placeholder={c.namePlaceholder}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="demo-contact">{c.contact}</Label>
                    <Input
                      id="demo-contact"
                      required
                      maxLength={160}
                      dir="ltr"
                      placeholder={c.contactPlaceholder}
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      className="h-11 text-start"
                    />
                    <p className="text-xs text-muted-foreground">{c.contactHint}</p>
                  </div>

                  <div className="space-y-2">
                    <Label>{c.role}</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <label
                        className={`flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer text-sm font-medium transition-colors ${
                          role === 'owner'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-input hover:bg-accent'
                        }`}
                      >
                        <input
                          type="radio"
                          name="role"
                          value="owner"
                          checked={role === 'owner'}
                          onChange={() => setRole('owner')}
                          className="sr-only"
                        />
                        <span>{c.roleOwner}</span>
                      </label>
                      <label
                        className={`flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer text-sm font-medium transition-colors ${
                          role === 'accountant'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-input hover:bg-accent'
                        }`}
                      >
                        <input
                          type="radio"
                          name="role"
                          value="accountant"
                          checked={role === 'accountant'}
                          onChange={() => setRole('accountant')}
                          className="sr-only"
                        />
                        <span>{c.roleAccountant}</span>
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="demo-business">{c.businessType}</Label>
                    <Input
                      id="demo-business"
                      maxLength={160}
                      placeholder={c.businessTypePlaceholder}
                      value={businessType}
                      onChange={(e) => setBusinessType(e.target.value)}
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="demo-time">{c.preferredTime}</Label>
                    <Input
                      id="demo-time"
                      maxLength={120}
                      placeholder={c.preferredTimePlaceholder}
                      value={preferredTime}
                      onChange={(e) => setPreferredTime(e.target.value)}
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="demo-msg">{c.message}</Label>
                    <Input
                      id="demo-msg"
                      maxLength={1000}
                      placeholder={c.messagePlaceholder}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="h-11"
                    />
                  </div>

                  {/* Honeypot field for bot spam prevention */}
                  <div aria-hidden className="absolute -start-[9999px] h-0 w-0 overflow-hidden">
                    <label>
                      Website
                      <input
                        ref={trapRef}
                        type="text"
                        name="website"
                        tabIndex={-1}
                        autoComplete="off"
                      />
                    </label>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-11 text-base font-medium"
                    disabled={isLoading}
                  >
                    {isLoading ? c.submitting : c.submit}
                  </Button>

                  <p className="text-xs text-center text-muted-foreground leading-relaxed">
                    {c.freeNote}
                  </p>

                  <div className="pt-4 border-t text-center text-sm text-muted-foreground space-y-1">
                    <div>
                      {c.orRegister}
                      <Link href="/register" className="text-primary font-medium hover:underline">
                        {c.registerLink}
                      </Link>
                    </div>
                    <div>
                      {c.hasAccount}
                      <Link href="/login" className="text-primary font-medium hover:underline">
                        {c.signIn}
                      </Link>
                    </div>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
