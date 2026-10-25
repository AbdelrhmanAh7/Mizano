import { DECORATORS } from '@nestjs/swagger/dist/constants';
import { ReportsController } from './reports.controller';

describe('ReportsController customer statement Swagger responses', () => {
  it.each([200, 400, 401, 403, 404])('AC1: documents HTTP %i with a description', (status) => {
    const responses = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      ReportsController.prototype.getCustomerStatement,
    );
    expect(responses).toHaveProperty(String(status));
    expect(responses[status].description).toEqual(expect.stringMatching(/\S/));
  });
});
