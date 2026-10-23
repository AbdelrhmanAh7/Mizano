import React from 'react';
import { render, screen } from '@testing-library/react';
import { CountrySelect } from './country-select';

let mockLocale = 'en';
jest.mock('next-intl', () => ({
  useLocale: () => mockLocale,
}));

describe('CountrySelect', () => {
  beforeEach(() => {
    mockLocale = 'en';
  });

  it('renders default placeholder in English', () => {
    mockLocale = 'en';
    render(<CountrySelect id="country" />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Select country');
  });

  it('renders default placeholder in Arabic', () => {
    mockLocale = 'ar';
    render(<CountrySelect id="country" />);
    expect(screen.getByRole('combobox')).toHaveTextContent('اختر الدولة');
  });

  it('displays selected country name and flag in English', () => {
    mockLocale = 'en';
    render(<CountrySelect id="country" value="United States" />);
    expect(screen.getByRole('combobox')).toHaveTextContent('🇺🇸 United States');
  });

  it('displays selected country name with Arabic and English in Arabic locale', () => {
    mockLocale = 'ar';
    render(<CountrySelect id="country" value="United States" />);
    expect(screen.getByRole('combobox')).toHaveTextContent('الولايات المتحدة (United States)');
  });
});
