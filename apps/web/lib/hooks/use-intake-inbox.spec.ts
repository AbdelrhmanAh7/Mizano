import api from '@/lib/api';
import { intakeInboxApi } from './use-intake-inbox';

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

describe('intakeInboxApi.openOriginal', () => {
  const get = api.get as jest.Mock;
  let open: jest.SpyInstance;
  let tab: { opener: unknown; closed: boolean; location: { href: string }; close: jest.Mock };
  const createObjectURL = jest.fn();
  const revokeObjectURL = jest.fn();
  const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    tab = { opener: window, closed: false, location: { href: 'about:blank' }, close: jest.fn() };
    open = jest.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    createObjectURL.mockReturnValue('blob:original');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
  });

  afterEach(() => {
    open.mockRestore();
    jest.useRealTimers();
    if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
    else Reflect.deleteProperty(URL, 'createObjectURL');
    if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
    else Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

  it('opens and detaches the tab synchronously, then navigates after the authenticated fetch', async () => {
    let resolveFetch!: (value: { data: Blob }) => void;
    get.mockImplementation(() => {
      expect(open).toHaveBeenCalledWith('about:blank', '_blank');
      expect(tab.opener).toBeNull();
      return new Promise<{ data: Blob }>((resolve) => {
        resolveFetch = resolve;
      });
    });
    const promise = intakeInboxApi.openOriginal('job/1');
    expect(open).toHaveBeenCalledTimes(1);
    expect(tab.location.href).toBe('about:blank');
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledWith('/ai/document-intake/job%2F1/original', {
      responseType: 'blob',
    });
    const blob = new Blob(['original'], { type: 'application/pdf' });
    resolveFetch({ data: blob });
    await promise;
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(tab.location.href).toBe('blob:original');
    expect(tab.close).not.toHaveBeenCalled();
    jest.advanceTimersByTime(59_999);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:original');
  });

  it('rejects a blocked popup before fetching, allowing the caller to show its error toast', async () => {
    open.mockReturnValue(null);
    await expect(intakeInboxApi.openOriginal('job')).rejects.toThrow(
      'Could not open the original file',
    );
    expect(get).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('propagates a synchronous popup error before fetching', async () => {
    open.mockImplementation(() => {
      throw new Error('popup denied');
    });
    await expect(intakeInboxApi.openOriginal('job')).rejects.toThrow('popup denied');
    expect(get).not.toHaveBeenCalled();
  });

  it('closes the reserved tab on fetch failure and propagates the rejection', async () => {
    get.mockRejectedValue(new Error('fetch failed'));
    await expect(intakeInboxApi.openOriginal('job')).rejects.toThrow('fetch failed');
    expect(tab.close).toHaveBeenCalledTimes(1);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('closes the tab and does not fetch when detaching the opener fails', async () => {
    Object.defineProperty(tab, 'opener', {
      set: () => {
        throw new Error('detach failed');
      },
    });
    await expect(intakeInboxApi.openOriginal('job')).rejects.toThrow('detach failed');
    expect(tab.close).toHaveBeenCalledTimes(1);
    expect(get).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('closes the tab if creating the blob URL fails', async () => {
    get.mockResolvedValue({ data: new Blob(['original']) });
    createObjectURL.mockImplementationOnce(() => {
      throw new Error('blob failed');
    });
    await expect(intakeInboxApi.openOriginal('job')).rejects.toThrow('blob failed');
    expect(tab.close).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('closes the tab and revokes the URL if navigation fails', async () => {
    get.mockResolvedValue({ data: new Blob(['original']) });
    Object.defineProperty(tab.location, 'href', {
      set: () => {
        throw new Error('navigation failed');
      },
    });
    await expect(intakeInboxApi.openOriginal('job')).rejects.toThrow('navigation failed');
    expect(tab.close).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:original');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not allocate a blob URL when the user closes the pending tab', async () => {
    get.mockImplementation(async () => {
      tab.closed = true;
      return { data: new Blob(['original']) };
    });
    await intakeInboxApi.openOriginal('job');
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(tab.close).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});
