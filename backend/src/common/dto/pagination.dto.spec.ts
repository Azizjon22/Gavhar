import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Paginated, PaginationQueryDto } from './pagination.dto';

const parse = (query: Record<string, unknown>) => {
  const dto = plainToInstance(PaginationQueryDto, query);
  return { dto, errors: validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }) };
};

describe('PaginationQueryDto', () => {
  it("standart qiymatlarni qo'yadi", () => {
    const { dto, errors } = parse({});

    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ page: 1, limit: 20, sortOrder: 'desc', skip: 0, take: 20 });
  });

  it('query satrlarini songa aylantiradi va skip ni hisoblaydi', () => {
    const { dto, errors } = parse({ page: '3', limit: '25', search: '  ali  ' });

    expect(errors).toHaveLength(0);
    expect(dto.skip).toBe(50);
    expect(dto.search).toBe('ali');
  });

  it.each([
    [{ limit: '101' }, 'limit'],
    [{ page: '0' }, 'page'],
    [{ sortOrder: 'random' }, 'sortOrder'],
    [{ sortBy: 'name; DROP TABLE users' }, 'sortBy'],
  ])('%j ni rad etadi', (query, property) => {
    const { errors } = parse(query);

    expect(errors.map((e) => e.property)).toContain(property);
  });
});

describe('Paginated', () => {
  it('meta ni hisoblaydi', () => {
    const result = Paginated.of([1, 2], 45, { page: 2, limit: 20 });

    expect(result.meta).toEqual({
      page: 2,
      limit: 20,
      total: 45,
      totalPages: 3,
      hasNext: true,
      hasPrev: true,
    });
  });

  it("bo'sh natijada ham kamida bitta sahifa bo'ladi", () => {
    expect(Paginated.of([], 0, { page: 1, limit: 20 }).meta).toMatchObject({
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    });
  });
});
