import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { IsMoney } from './money';

class PriceDto {
  @IsMoney()
  price: string;
}

const parse = (price: unknown) => {
  const dto = plainToInstance(PriceDto, { price });
  return { dto, valid: validateSync(dto).length === 0 };
};

describe('IsMoney', () => {
  it.each([
    ['1500000', '1500000'],
    ['1500000.5', '1500000.5'],
    ['0', '0'],
    [' 250000.25 ', '250000.25'],
    [1500000, '1500000'],
    [99.99, '99.99'],
  ])('%p ni qabul qiladi', (input, expected) => {
    const { dto, valid } = parse(input);

    expect(valid).toBe(true);
    expect(dto.price).toBe(expected);
  });

  it.each([
    '-100',
    '1e6',
    '1,500,000',
    '1 500 000',
    '100.123',
    '00100',
    '12345678901234',
    '',
    'abc',
    null,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    { amount: 1 },
  ])('%p ni rad etadi', (input) => {
    expect(parse(input).valid).toBe(false);
  });
});
