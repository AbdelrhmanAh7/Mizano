import { act, renderHook } from '@testing-library/react';
import { useBulkConfirm } from './use-bulk-confirm';

describe('useBulkConfirm', () => {
  it('opens for the chosen rows, runs the action on their ids, then closes and refreshes', async () => {
    const execute = jest.fn().mockResolvedValue({ processed: 2 });
    const onDone = jest.fn();
    const { result } = renderHook(() =>
      useBulkConfirm<{ id: string }>({ execute, isLoading: false }, onDone),
    );

    act(() => result.current.openFor([{ id: 'a' }, { id: 'b' }]));
    expect(result.current.dialogProps.open).toBe(true);
    expect(result.current.count).toBe(2);

    await act(() => result.current.dialogProps.onConfirm());
    expect(execute).toHaveBeenCalledWith(['a', 'b']);
    expect(result.current.dialogProps.open).toBe(false);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('stays open and does not refresh when the action fails', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('boom'));
    const onDone = jest.fn();
    const { result } = renderHook(() =>
      useBulkConfirm<{ id: string }>({ execute, isLoading: false }, onDone),
    );
    act(() => result.current.openFor([{ id: 'a' }]));
    await act(() => expect(result.current.dialogProps.onConfirm()).rejects.toThrow('boom'));
    expect(result.current.dialogProps.open).toBe(true);
    expect(onDone).not.toHaveBeenCalled();
  });
});
