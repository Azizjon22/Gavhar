/** "1250.5" → "1 250,5". Minglik bo'yicha guruhlanadi, kasr vergul bilan. */
export const formatQuantity = (value: string | null | undefined): string => {
  if (!value) return '0';
  const [integer = '0', fraction] = value.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return fraction ? `${grouped},${fraction}` : grouped;
};

/**
 * Kiritilayotgan matnni miqdorga keltiradi: faqat raqamlar va (ruxsat bo'lsa)
 * bitta kasr ajratgich, kasrda ko'pi bilan 3 xona. Vergul ham qabul qilinadi.
 */
export const parseQuantityInput = (input: string, allowFraction: boolean): string => {
  const cleaned = input.replace(/,/g, '.').replace(/[^\d.]/g, '');
  const [rawInteger = '', ...rest] = cleaned.split('.');
  const integer = rawInteger.replace(/^0+(?=\d)/, '').slice(0, 9);
  if (!allowFraction || !cleaned.includes('.')) return integer;
  return `${integer || '0'}.${rest.join('').slice(0, 3)}`;
};

/** Serverga yuboriladigan ko'rinish: oxiridagi nuqta va ortiqcha nollarsiz. */
export const toQuantityValue = (input: string): string => {
  if (!input.includes('.')) return input;
  return input.replace(/0+$/, '').replace(/\.$/, '');
};

/** Noldan katta to'g'ri miqdormi. */
export const isPositiveQuantity = (input: string): boolean =>
  /^\d{1,9}(\.\d{1,3})?$/.test(toQuantityValue(input)) && Number(input) > 0;
