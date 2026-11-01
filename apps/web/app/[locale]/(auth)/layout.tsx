import { LegalLinks } from '@/components/legal/legal-links';

export default function AuthLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <>
      {children}
      <LegalLinks className="bg-cyan-100 dark:bg-gray-800" />
    </>
  );
}
