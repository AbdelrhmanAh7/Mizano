'use client';

import { useTranslations } from 'next-intl';
import { BrandLogo } from './brand-logo';

/** The logo centred above the title of the sign-up and password cards. */
export function AuthCardLogo(): JSX.Element {
  const tCommon = useTranslations('common');
  return (
    <div className="mb-3 flex justify-center">
      <BrandLogo height={36} alt={tCommon('appName')} priority />
    </div>
  );
}
