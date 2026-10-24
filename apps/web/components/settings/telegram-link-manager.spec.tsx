import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TelegramLinkManager } from './telegram-link-manager';
import api from '@/lib/api';

// Mock api
jest.mock('@/lib/api', () => ({
  get: jest.fn(),
  post: jest.fn(),
  delete: jest.fn(),
}));

const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock next-intl
const translations: Record<string, string> = {
  title: 'Telegram Links',
  description: 'Connect Telegram chats to automatically intake invoice documents',
  generateCode: 'Generate Telegram Link Code',
  generating: 'Generating...',
  codeGenerated: 'Link code generated',
  codeInstruction: 'Send the following command to your Telegram bot in a private chat:',
  expiresIn: 'Expires in 15 minutes',
  copyCommand: 'Copy Command',
  copied: 'Copied to clipboard',
  activeLinks: 'Active Telegram Links',
  noLinks: 'No Telegram chats currently linked',
  chatId: 'Chat ID',
  linkedAt: 'Linked Date',
  actions: 'Actions',
  unlink: 'Unlink',
  unlinking: 'Unlinking...',
  unlinkSuccess: 'Telegram chat unlinked successfully',
  unlinkConfirm: 'Are you sure you want to unlink this chat?',
  errorGenerating: 'Failed to generate link code',
  errorFetching: 'Failed to load Telegram links',
  errorUnlinking: 'Failed to unlink Telegram chat',
};

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => translations[key] || key,
  useLocale: () => 'en',
}));

describe('TelegramLinkManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        data: [
          {
            id: 'link-1',
            chatId: '123456789',
            createdAt: '2026-10-20T12:00:00.000Z',
          },
        ],
      },
    });
  });

  it('renders the Generate Telegram Link Code button', async () => {
    render(<TelegramLinkManager />);

    const button = await screen.findByRole('button', { name: /Generate Telegram Link Code/i });
    expect(button).toBeInTheDocument();
  });

  it('loads and displays active Telegram links', async () => {
    render(<TelegramLinkManager />);

    expect(await screen.findByText('123456789')).toBeInTheDocument();
    expect(screen.getByText('Active Telegram Links')).toBeInTheDocument();
  });

  it('generates a one-time link code and displays the /link command', async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({
      data: {
        data: {
          code: '849201',
          expiresAt: '2026-10-20T12:15:00.000Z',
          command: '/link 849201',
        },
      },
    });

    render(<TelegramLinkManager />);

    const generateBtn = await screen.findByRole('button', { name: /Generate Telegram Link Code/i });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/telegram/link-code');
    });

    expect(await screen.findByText('/link 849201')).toBeInTheDocument();
    expect(screen.getByText('Copy Command')).toBeInTheDocument();
  });

  it('copies command to clipboard when Copy Command button is clicked', async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({
      data: {
        data: {
          code: '849201',
          expiresAt: '2026-10-20T12:15:00.000Z',
          command: '/link 849201',
        },
      },
    });

    const writeTextMock = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<TelegramLinkManager />);

    const generateBtn = await screen.findByRole('button', { name: /Generate Telegram Link Code/i });
    fireEvent.click(generateBtn);

    const copyBtn = await screen.findByTestId('copy-telegram-command-button');
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith('/link 849201');
    expect(await screen.findByText('Copied to clipboard')).toBeInTheDocument();
  });

  it('unlinks an active chat after confirmation', async () => {
    window.confirm = jest.fn(() => true);
    (api.delete as jest.Mock).mockResolvedValueOnce({ status: 204 });

    render(<TelegramLinkManager />);

    const unlinkBtn = await screen.findByTestId('unlink-telegram-button-link-1');
    fireEvent.click(unlinkBtn);

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/telegram/links/link-1');
    });
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Telegram chat unlinked successfully',
      }),
    );
  });

  it('displays empty state when no links exist', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({
      data: { data: [] },
    });

    render(<TelegramLinkManager />);

    expect(await screen.findByText('No Telegram chats currently linked')).toBeInTheDocument();
  });
});
