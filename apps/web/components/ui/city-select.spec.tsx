import { render, screen } from '@testing-library/react';
import React from 'react';
import { CitySelect } from './city-select';

describe('CitySelect (#373 AC5)', () => {
  it('renders disabled input with "Select a country first" when country is not selected', () => {
    render(<CitySelect id="test-city" aria-label="Billing City" />);

    const input = screen.getByPlaceholderText('Select a country first');
    expect(input).toBeInTheDocument();
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('aria-label', 'Billing City');
  });

  it('renders enabled input with "Enter city name" when country without preset cities is selected', () => {
    // Country "ZZ" has no predefined cities list in lib/data/countries
    render(<CitySelect id="test-city" country="ZZ" aria-label="Shipping City" />);

    const input = screen.getByPlaceholderText('Enter city name');
    expect(input).toBeInTheDocument();
    expect(input).not.toBeDisabled();
    expect(input).toHaveAttribute('aria-label', 'Shipping City');
  });

  it('renders select dropdown when country with preset cities is selected', () => {
    // Egypt (EG) has predefined cities in lib/data/countries
    render(<CitySelect id="test-city" country="EG" aria-label="City Dropdown" />);

    const trigger = screen.getByRole('combobox');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-label', 'City Dropdown');
  });
});
