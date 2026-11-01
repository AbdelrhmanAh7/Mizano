import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import enSettings from '@/messages/en/settings.json';
import arSettings from '@/messages/ar/settings.json';
import type { AiModel } from '@/lib/api/ai-settings';
import { AiModelPicker, filterModels, isFree, pricePerBill } from './ai-model-picker';

let messages: Record<string, unknown> = { settings: enSettings };
function lookup(namespace: string, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of [...namespace.split('.'), ...key.split('.')]) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  return typeof node === 'string' ? node : undefined;
}
jest.mock('next-intl', () => ({
  useTranslations: (namespace: string) =>
    Object.assign(
      (key: string, values?: Record<string, string | number>) =>
        (lookup(namespace, key) ?? key).replace(/\{(\w+)\}/g, (_, k: string) =>
          String(values?.[k] ?? ''),
        ),
      { has: (key: string) => lookup(namespace, key) !== undefined },
    ),
}));

const mutate = jest.fn();
let pending = false;
jest.mock('@/lib/hooks/use-ai-settings', () => ({
  useChooseAiModel: () => ({ mutate, isPending: pending }),
}));

const models: AiModel[] = [
  {
    id: 'google/gemini-3.8-flash',
    name: 'Gemini Flash',
    vision: true,
    recommended: true,
    pricePerMtok: ['0.3', '2.5'],
  },
  { id: 'meta/free-vision:free', name: 'Free Vision', vision: true, pricePerMtok: ['0', '0'] },
  { id: 'meta/text-only', name: 'Text Only', vision: false, pricePerMtok: ['1', '2'] },
];

beforeEach(() => {
  mutate.mockReset();
  pending = false;
  messages = { settings: enSettings };
});

describe('model helpers', () => {
  it('prices a typical bill, spots free models and filters by search and vision', () => {
    expect(pricePerBill(models[0])).toBeCloseTo((0.3 * 3000 + 2.5 * 800) / 1e6, 8);
    expect(pricePerBill({ id: 'x', name: 'x' })).toBeNull();
    expect(isFree(models[1])).toBe(true);
    expect(isFree(models[0])).toBe(false);
    expect(filterModels(models, '', true).map((m) => m.id)).not.toContain('meta/text-only');
    expect(filterModels(models, '', false)).toHaveLength(3);
    expect(filterModels(models, 'FLASH', false).map((m) => m.id)).toEqual([
      'google/gemini-3.8-flash',
    ]);
  });
});

describe('AiModelPicker', () => {
  it('lists name, recommended, free and vision, and hides text-only models by default', () => {
    render(<AiModelPicker models={models} current="google/gemini-3.8-flash" />);
    expect(screen.getByText('Recommended')).toBeTruthy();
    expect(screen.getByText('Free')).toBeTruthy();
    expect(screen.queryByText('Text Only')).toBeNull();
    fireEvent.click(screen.getByLabelText(/Only models that can read bills/));
    expect(screen.getByText('Text Only')).toBeTruthy();
    expect(screen.getByText('Text only')).toBeTruthy();
  });

  it('searches the list', () => {
    render(<AiModelPicker models={models} current={null} />);
    fireEvent.change(screen.getByLabelText('Search models'), { target: { value: 'free vision' } });
    expect(screen.getByText('Free Vision')).toBeTruthy();
    expect(screen.queryByText('Gemini Flash')).toBeNull();
  });

  it('choosing a model asks the server to test it, and shows the provider reason, the kept choice and a suggestion when it fails', () => {
    render(<AiModelPicker models={models} current="google/gemini-3.8-flash" />);
    fireEvent.click(screen.getByRole('button', { name: /Use Free Vision/ }));
    expect(mutate).toHaveBeenCalledWith('meta/free-vision:free', expect.anything());

    const options = mutate.mock.calls[0][1] as {
      onSuccess: (r: { ok: false; code: string; suggestions: AiModel[] }) => void;
    };
    React.act(() =>
      options.onSuccess({ ok: false, code: 'AI_FORBIDDEN', suggestions: [models[0]] }),
    );

    const alert = screen.getByTestId('ai-model-failed').textContent ?? '';
    expect(alert).toContain('meta/free-vision:free did not work');
    expect(alert).toContain(enSettings.aiErrors.AI_FORBIDDEN);
    expect(alert).toContain('Your previous choice (google/gemini-3.8-flash) is unchanged.');
    fireEvent.click(screen.getByRole('button', { name: 'Gemini Flash' }));
    expect(mutate).toHaveBeenLastCalledWith('google/gemini-3.8-flash', expect.anything());
  });

  it('shows the Arabic reason when the locale is Arabic', () => {
    messages = { settings: arSettings };
    render(<AiModelPicker models={models} current="google/gemini-3.8-flash" />);
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`${arSettings.ai.picker.use} Free Vision`) }),
    );
    const options = mutate.mock.calls[0][1] as {
      onSuccess: (r: { ok: false; code: string; suggestions: AiModel[] }) => void;
    };
    React.act(() => options.onSuccess({ ok: false, code: 'AI_KEY_NO_CREDIT', suggestions: [] }));
    expect(screen.getByTestId('ai-model-failed').textContent).toContain(
      arSettings.aiErrors.AI_KEY_NO_CREDIT,
    );
  });
});
