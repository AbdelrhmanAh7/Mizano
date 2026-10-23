import React from 'react';
import { render, screen } from '@testing-library/react';
import { CitySelect } from './city-select';

// Mock next-intl
let mockLocale = 'en';
jest.mock('next-intl', () => ({
  useLocale: () => mockLocale,
  useTranslations: () => (key: string) => key,
}));

describe('CitySelect component (#316 AC1 & AC2)', () => {
  beforeEach(() => {
    mockLocale = 'en';
  });

  describe('AC1: Country dependency - disabled state and placeholder when no country', () => {
    it('is disabled and shows "Select a country first" in English when country is undefined', () => {
      mockLocale = 'en';
      render(<CitySelect id="city" />);
      const input = screen.getByPlaceholderText('Select a country first');
      expect(input).toBeInTheDocument();
      expect(input).toBeDisabled();
    });

    it('is disabled and shows "Select a country first" in English when country is empty string', () => {
      mockLocale = 'en';
      render(<CitySelect id="city" country="" />);
      const input = screen.getByPlaceholderText('Select a country first');
      expect(input).toBeInTheDocument();
      expect(input).toBeDisabled();
    });

    it('treats whitespace-only country as unselected, disabling input and showing guidance', () => {
      mockLocale = 'en';
      render(<CitySelect id="city" country="   " />);
      const input = screen.getByPlaceholderText('Select a country first');
      expect(input).toBeInTheDocument();
      expect(input).toBeDisabled();
    });

    it('displays Arabic guidance placeholder "اختر الدولة أولاً" and remains disabled when locale is "ar"', () => {
      mockLocale = 'ar';
      render(<CitySelect id="city" />);
      const input = screen.getByPlaceholderText('اختر الدولة أولاً');
      expect(input).toBeInTheDocument();
      expect(input).toBeDisabled();
    });
  });

  describe('AC2: Country dependency - enabled state and placeholder when country is selected', () => {
    it('is enabled and shows "Enter city name" in English for a country without pre-populated cities', () => {
      mockLocale = 'en';
      render(<CitySelect id="city" country="UnknownCountry123" />);
      const input = screen.getByPlaceholderText('Enter city name');
      expect(input).toBeInTheDocument();
      expect(input).toBeEnabled();
    });

    it('is enabled and shows "أدخل اسم المدينة" in Arabic for a country without pre-populated cities', () => {
      mockLocale = 'ar';
      render(<CitySelect id="city" country="UnknownCountry123" />);
      const input = screen.getByPlaceholderText('أدخل اسم المدينة');
      expect(input).toBeInTheDocument();
      expect(input).toBeEnabled();
    });

    it('respects custom placeholder when provided', () => {
      mockLocale = 'en';
      render(
        <CitySelect id="city" country="UnknownCountry123" placeholder="Custom City Placeholder" />,
      );
      const input = screen.getByPlaceholderText('Custom City Placeholder');
      expect(input).toBeInTheDocument();
      expect(input).toBeEnabled();
    });

    it('passes aria-label to input when rendered as fallback', () => {
      mockLocale = 'en';
      render(
        <CitySelect
          id="city"
          country="UnknownCountry123"
          aria-label="City of residence"
        />,
      );
      const input = screen.getByLabelText('City of residence');
      expect(input).toBeInTheDocument();
    });
  });

  describe('AC3: Explicit disabled prop', () => {
    it('remains disabled when disabled={true} even if valid country is provided', () => {
      mockLocale = 'en';
      render(<CitySelect id="city" country="UnknownCountry123" disabled={true} />);
      const input = screen.getByPlaceholderText('Enter city name');
      expect(input).toBeInTheDocument();
      expect(input).toBeDisabled();
    });
  });
});
