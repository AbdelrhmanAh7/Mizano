import axios from 'axios';
import { workOrdersApi } from './api';

jest.mock('next-auth/react', () => ({ getSession: jest.fn(), signOut: jest.fn() }));

describe('workOrdersApi.bulkComplete', () => {
  it('posts the selected ids to the manufacturing work orders bulk-complete route', async () => {
    const request = jest
      .spyOn(axios.Axios.prototype, 'request')
      .mockResolvedValue({ data: { processed: 2, total: 2, failures: [] } });

    await workOrdersApi.bulkComplete(['wo-1', 'wo-2']);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'post',
        url: '/manufacturing/work-orders/bulk-complete',
        data: { ids: ['wo-1', 'wo-2'] },
      }),
    );
    request.mockRestore();
  });

  it('routes bulkStart, bulkCancel and bulkDelete through /manufacturing/work-orders', async () => {
    const request = jest.spyOn(axios.Axios.prototype, 'request').mockResolvedValue({ data: {} });

    await workOrdersApi.bulkStart(['wo-1']);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'post',
        url: '/manufacturing/work-orders/bulk-start',
        data: { ids: ['wo-1'] },
      }),
    );

    await workOrdersApi.bulkCancel(['wo-1']);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'post',
        url: '/manufacturing/work-orders/bulk-cancel',
        data: { ids: ['wo-1'] },
      }),
    );

    await workOrdersApi.bulkDelete(['wo-1']);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'post',
        url: '/manufacturing/work-orders/bulk-delete',
        data: { ids: ['wo-1'] },
      }),
    );

    request.mockRestore();
  });
});
