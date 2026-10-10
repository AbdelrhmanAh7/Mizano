import { PERMISSIONS_KEY } from '../../../common/decorators/permissions.decorator';
import { OpeningBalancesController } from './opening-balances.controller';

describe('OpeningBalancesController permissions', () => {
  it('needs only the posting permission so the default Accountant can post openings', () => {
    const required = Reflect.getMetadata(PERMISSIONS_KEY, OpeningBalancesController.prototype.post);

    expect(required).toEqual(['accounting.create']);
  });
});
