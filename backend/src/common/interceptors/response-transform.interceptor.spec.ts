import { CallHandler, ExecutionContext, StreamableFile } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { Paginated } from '../dto/pagination.dto';
import { ResponseTransformInterceptor } from './response-transform.interceptor';

const run = (body: unknown) => {
  const handler: CallHandler = { handle: () => of(body) };
  return firstValueFrom(
    new ResponseTransformInterceptor().intercept({} as ExecutionContext, handler),
  );
};

describe('ResponseTransformInterceptor', () => {
  it("oddiy natijani data ichiga o'raydi", async () => {
    await expect(run({ id: 1 })).resolves.toEqual({ success: true, data: { id: 1 } });
  });

  it('undefined natijani null ga aylantiradi', async () => {
    await expect(run(undefined)).resolves.toEqual({ success: true, data: null });
  });

  it('sahifalangan natijani data + meta ga yoyadi', async () => {
    const result = await run(Paginated.of(['a'], 1, { page: 1, limit: 20 }));

    expect(result).toMatchObject({ success: true, data: ['a'], meta: { total: 1 } });
  });

  it('fayl oqimiga tegmaydi', async () => {
    const file = new StreamableFile(Buffer.from('pdf'));

    await expect(run(file)).resolves.toBe(file);
  });
});
