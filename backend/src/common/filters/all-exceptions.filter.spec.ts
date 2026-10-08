import { ArgumentsHost, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

const createHost = () => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ originalUrl: '/api/v1/test', method: 'POST', id: 'req-1' }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
};

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('validatsiya xatolarini details bilan qaytaradi', () => {
    const { host, status, json } = createHost();

    filter.catch(new BadRequestException(['email must be an email']), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          details: ['email must be an email'],
        }),
        requestId: 'req-1',
        path: '/api/v1/test',
      }),
    );
  });

  it('maxsus xato kodini saqlaydi', () => {
    const { host, json } = createHost();

    filter.catch(new ConflictException({ code: 'HALL_BUSY', message: 'Zal band' }), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: { code: 'HALL_BUSY', message: 'Zal band' } }),
    );
  });

  it('kutilmagan xatoning ichki tafsilotini mijozga chiqarmaydi', () => {
    const { host, status, json } = createHost();

    filter.catch(new Error('connection string postgres://user:parol@db'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(json.mock.calls[0])).not.toContain('parol');
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'INTERNAL_SERVER_ERROR' }),
      }),
    );
    expect(Logger.prototype.error).toHaveBeenCalled();
  });
});
