/**
 * Regression tests for the CitySelect text-input fallback (#493, split from #481):
 * without a country the input must be disabled and say "Select a country first".
 */

import { render, screen } from '@testing-library/react';
import { CitySelect } from './city-select';

describe('CitySelect fallback input', () => {
  it('is disabled with "Select a country first" when no country is chosen', () => {
    render(<CitySelect id="city" />);
    const input = screen.getByPlaceholderText('Select a country first');
    expect(input).toBeDisabled();
  });

  it('is enabled with "Enter city name" for a country without city data', () => {
    render(<CitySelect id="city" country="Atlantis" />);
    const input = screen.getByPlaceholderText('Enter city name');
    expect(input).toBeEnabled();
  });

  it('stays disabled when the disabled prop is set', () => {
    render(<CitySelect id="city" country="Atlantis" disabled />);
    expect(screen.getByPlaceholderText('Enter city name')).toBeDisabled();
  });
});
