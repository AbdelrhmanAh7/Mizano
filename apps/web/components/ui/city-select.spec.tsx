import React from 'react';
import { render, screen } from '@testing-library/react';
import { CitySelect } from './city-select';

// Mock next-intl
let mockLocale = 'en';
jest.mock('next-intl', () => ({
  useLocale: () => mockLocale,
  useTranslations: () => (key: string) => key,
}));

describe('CitySelect', () => {
  beforeEach(() => {
    mockLocale = 'en';
  });

  describe('AC1: Country dependency - disabled state and placeholder when no country', () => {
    it('is disabled and shows "Select a country first" in English when country is undefined', () => {
      mockLocale = 'en';
      render(<CitySelect id="city" />);
      const input = screen.getByPlaceholderText('Select a country first');
      expect(input).toBeDisabled();
    });

    it('is disabled and shows "Select a country first" in English when country is empty string or whitespace', () => {
      mockLocale = 'en';
      const { rerender } = render(<CitySelect id="city" country="" />);
      expect(screen.getByPlaceholderText('Select a country first')).toBeDisabled();

      rerender(<CitySelect id="city" country="   " />);
      expect(screen.getByPlaceholderText('Select a country first')).toBeDisabled();
    });

    it('is disabled and shows "اختر الدولة أولاً" in Arabic when country is not selected', () => {
      mockLocale = 'ar';
      render(<CitySelect id="city" />);
      const input = screen.getByPlaceholderText('اختر الدولة أولاً');
      expect(input).toBeDisabled();
    });
  });

  describe('AC2: Country dependency - enabled state and placeholder when country is selected', () => {
    it('is enabled and shows "Enter city name" in English for a country without pre-populated cities', () => {
      mockLocale = 'en';
      render(<CitySelect id="city" country="UnknownCountry123" />);
      const input = screen.getByPlaceholderText('Enter city name');
      expect(input).not.toBeDisabled();
    });

    it('is enabled and shows "أدخل اسم المدينة" in Arabic for a country without pre-populated cities', () => {
      mockLocale = 'ar';
      render(<CitySelect id="city" country="UnknownCountry123" />);
      const input = screen.getByPlaceholderText('أدخل اسم المدينة');
      expect(input).not.toBeDisabled();
    });

    it('respects custom placeholder when provided', () => {
      mockLocale = 'en';
      render(
        <CitySelect id="city" country="UnknownCountry123" placeholder="Custom City Placeholder" />,
      );
      expect(screen.getByPlaceholderText('Custom City Placeholder')).not.toBeDisabled();
    });
  });

  describe('AC3: Explicit disabled prop', () => {
    it('remains disabled when disabled={true} even if valid country is provided', () => {
      mockLocale = 'en';
      render(<CitySelect id="city" country="UnknownCountry123" disabled={true} />);
      const input = screen.getByPlaceholderText('Enter city name');
      expect(input).toBeDisabled();
    });
  });
});
