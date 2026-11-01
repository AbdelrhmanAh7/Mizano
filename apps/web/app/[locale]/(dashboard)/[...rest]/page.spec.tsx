import { notFound } from 'next/navigation';
import UnknownPage from './page';

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

describe('UnknownPage', () => {
  it('hands every unknown address to the translated not-found page', () => {
    expect(() => UnknownPage()).toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalledTimes(1);
  });
});
